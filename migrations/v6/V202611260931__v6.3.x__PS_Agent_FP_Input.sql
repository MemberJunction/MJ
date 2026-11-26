-- =====================================================================================
-- PR 5: Predictive Studio — The Agent as a Drafter, and Feature Pipelines as Input
-- Milestone sections merged in dependency order during integration.
-- =====================================================================================

-- section: B4
-- Search-strategy policy comparison ledger (PR 5 §5.2.5): equal-cost evidence against random
-- search on W1-signal and C1 before a guided Wave Strategist (bayesian or successive-halving)
-- can be enabled. LowerBoundMin holds the minimum paired lower bound across datasets; Passed is
-- computed server-side by code (LowerBoundMin > 0).
CREATE TABLE [${flyway:defaultSchema}].[MLSearchStrategyComparison] (
    [ID]                         UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_MLSearchStrategyComparison_ID] DEFAULT (newsequentialid()),
    [Method]                     NVARCHAR(40)     COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    [ComputeBudgetSecondsPerArm] DECIMAL(18, 4)   NOT NULL,
    [Datasets]                   NVARCHAR(MAX)    COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    [PairedDifference]           NVARCHAR(MAX)    COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    [LowerBoundMin]              DECIMAL(18, 6)   NOT NULL,
    [Passed]                     BIT              NOT NULL CONSTRAINT [DF_MLSearchStrategyComparison_Passed] DEFAULT ((0)),
    [ComparedAt]                 DATETIMEOFFSET   NOT NULL CONSTRAINT [DF_MLSearchStrategyComparison_ComparedAt] DEFAULT (SYSDATETIMEOFFSET()),
    [ComparedByUserID]           UNIQUEIDENTIFIER NOT NULL,
    [__mj_CreatedAt]             DATETIMEOFFSET   NOT NULL CONSTRAINT [DF_MLSearchStrategyComparison_CreatedAt] DEFAULT (GETUTCDATE()),
    [__mj_UpdatedAt]             DATETIMEOFFSET   NOT NULL CONSTRAINT [DF_MLSearchStrategyComparison_UpdatedAt] DEFAULT (GETUTCDATE()),
    CONSTRAINT [PK_MLSearchStrategyComparison] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [CK_MLSearchStrategyComparison_Method] CHECK ([Method] IN (N'bayesian', N'successive-halving')),
    CONSTRAINT [CK_MLSearchStrategyComparison_ComputeBudget] CHECK ([ComputeBudgetSecondsPerArm] > 0),
    CONSTRAINT [FK_MLSearchStrategyComparison_User] FOREIGN KEY ([ComparedByUserID]) REFERENCES [${flyway:defaultSchema}].[User] ([ID])
);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Equal-cost paired comparison ledger between a guided search strategy (bayesian or successive-halving) and seeded random search across W1-signal and scenario C1. A guided protocol is accepted only when referencing a row with Passed = 1.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'MLSearchStrategyComparison';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key of the search-strategy comparison record.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'MLSearchStrategyComparison',
    @level2type = N'COLUMN', @level2name = N'ID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Guided search method compared against seeded random search: bayesian or successive-halving.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'MLSearchStrategyComparison',
    @level2type = N'COLUMN', @level2name = N'Method';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Equal-cost compute budget (seconds per arm) allocated to both the guided method and the seeded random baseline.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'MLSearchStrategyComparison',
    @level2type = N'COLUMN', @level2name = N'ComputeBudgetSecondsPerArm';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON array of {Dataset, Seeds} entries documenting the datasets and random seeds evaluated (must include W1-signal and C1).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'MLSearchStrategyComparison',
    @level2type = N'COLUMN', @level2name = N'Datasets';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON map from dataset name to PairedComparison ({value, ci, beats}) comparing the guided method against seeded random search.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'MLSearchStrategyComparison',
    @level2type = N'COLUMN', @level2name = N'PairedDifference';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Minimum of the paired lower bounds (ci[0]) across W1-signal and C1; never an average.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'MLSearchStrategyComparison',
    @level2type = N'COLUMN', @level2name = N'LowerBoundMin';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Computed server-side as LowerBoundMin > 0; client writes supplying a different value are refused.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'MLSearchStrategyComparison',
    @level2type = N'COLUMN', @level2name = N'Passed';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when the paired comparison was recorded.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'MLSearchStrategyComparison',
    @level2type = N'COLUMN', @level2name = N'ComparedAt';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'User who recorded or initiated the search-strategy comparison.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'MLSearchStrategyComparison',
    @level2type = N'COLUMN', @level2name = N'ComparedByUserID';
GO



















































/* =====================================================================================
 * EVERYTHING BELOW THIS BLOCK WAS GENERATED BY THE MEMBERJUNCTION CODEGEN TOOL.
 *
 * Entity, EntityField, EntityFieldValue, EntityPermission, ApplicationEntity,
 * EntityRelationship, EntitySetting, FK index, base view, stored procedures, and trigger
 * for MJ: ML Search Strategy Comparisons (MLSearchStrategyComparison).
 * EntityField Sequence literals replaced with apply-time MAX(Sequence)+1 expressions.
 * ===================================================================================== */

/* SQL generated to create new entity MJ: ML Search Strategy Comparisons */

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
         [AllowUserSearchAPI],
         [AllowCaching]
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
         '9fc3a952-86e6-451f-a818-ff78131e38c7',
         'MJ: ML Search Strategy Comparisons',
         'ML Search Strategy Comparisons',
         'Equal-cost paired comparison ledger between a guided search strategy (bayesian or successive-halving) and seeded random search across W1-signal and scenario C1. A guided protocol is accepted only when referencing a row with Passed = 1.',
         NULL,
         'MLSearchStrategyComparison',
         'vwMLSearchStrategyComparisons',
         '${flyway:defaultSchema}',
         1,
         1,
         1
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
      );

/* SQL generated to add new entity MJ: ML Search Strategy Comparisons to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '9fc3a952-86e6-451f-a818-ff78131e38c7', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Search Strategy Comparisons for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('9fc3a952-86e6-451f-a818-ff78131e38c7', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Search Strategy Comparisons for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('9fc3a952-86e6-451f-a818-ff78131e38c7', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Search Strategy Comparisons for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('9fc3a952-86e6-451f-a818-ff78131e38c7', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to insert 11 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9b7436dc-e8b6-4b37-a653-a1f7a06f8cc0' OR (EntityID = '9FC3A952-86E6-451F-A818-FF78131E38C7' AND Name = 'ID')) BEGIN
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
            '9b7436dc-e8b6-4b37-a653-a1f7a06f8cc0',
            '9FC3A952-86E6-451F-A818-FF78131E38C7', -- Entity: MJ: ML Search Strategy Comparisons
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9FC3A952-86E6-451F-A818-FF78131E38C7'),
            'ID',
            'ID',
            'Primary key of the search-strategy comparison record.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
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
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2da1b491-5782-4974-8978-b50b263cf60a' OR (EntityID = '9FC3A952-86E6-451F-A818-FF78131E38C7' AND Name = 'Method')) BEGIN
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
            '2da1b491-5782-4974-8978-b50b263cf60a',
            '9FC3A952-86E6-451F-A818-FF78131E38C7', -- Entity: MJ: ML Search Strategy Comparisons
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9FC3A952-86E6-451F-A818-FF78131E38C7'),
            'Method',
            'Method',
            'Guided search method compared against seeded random search: bayesian or successive-halving.',
            'nvarchar',
            80,
            0,
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '03f4e814-24c8-4eca-baa6-aa2bae6a0ecc' OR (EntityID = '9FC3A952-86E6-451F-A818-FF78131E38C7' AND Name = 'ComputeBudgetSecondsPerArm')) BEGIN
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
            '03f4e814-24c8-4eca-baa6-aa2bae6a0ecc',
            '9FC3A952-86E6-451F-A818-FF78131E38C7', -- Entity: MJ: ML Search Strategy Comparisons
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9FC3A952-86E6-451F-A818-FF78131E38C7'),
            'ComputeBudgetSecondsPerArm',
            'Compute Budget Seconds Per Arm',
            'Equal-cost compute budget (seconds per arm) allocated to both the guided method and the seeded random baseline.',
            'decimal',
            9,
            18,
            4,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1a8dac7a-d43d-45ed-b056-b34fcd201c87' OR (EntityID = '9FC3A952-86E6-451F-A818-FF78131E38C7' AND Name = 'Datasets')) BEGIN
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
            '1a8dac7a-d43d-45ed-b056-b34fcd201c87',
            '9FC3A952-86E6-451F-A818-FF78131E38C7', -- Entity: MJ: ML Search Strategy Comparisons
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9FC3A952-86E6-451F-A818-FF78131E38C7'),
            'Datasets',
            'Datasets',
            'JSON array of {Dataset, Seeds} entries documenting the datasets and random seeds evaluated (must include W1-signal and C1).',
            'nvarchar',
            -1,
            0,
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '491cf7a6-ffb4-4936-ac19-f71762dd7205' OR (EntityID = '9FC3A952-86E6-451F-A818-FF78131E38C7' AND Name = 'PairedDifference')) BEGIN
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
            '491cf7a6-ffb4-4936-ac19-f71762dd7205',
            '9FC3A952-86E6-451F-A818-FF78131E38C7', -- Entity: MJ: ML Search Strategy Comparisons
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9FC3A952-86E6-451F-A818-FF78131E38C7'),
            'PairedDifference',
            'Paired Difference',
            'JSON map from dataset name to PairedComparison ({value, ci, beats}) comparing the guided method against seeded random search.',
            'nvarchar',
            -1,
            0,
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e11398ef-0f37-45ba-a54b-04f15f4c258a' OR (EntityID = '9FC3A952-86E6-451F-A818-FF78131E38C7' AND Name = 'LowerBoundMin')) BEGIN
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
            'e11398ef-0f37-45ba-a54b-04f15f4c258a',
            '9FC3A952-86E6-451F-A818-FF78131E38C7', -- Entity: MJ: ML Search Strategy Comparisons
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9FC3A952-86E6-451F-A818-FF78131E38C7'),
            'LowerBoundMin',
            'Lower Bound Min',
            'Minimum of the paired lower bounds (ci[0]) across W1-signal and C1; never an average.',
            'decimal',
            9,
            18,
            6,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd8acd3fb-31ec-4aa0-8f3f-571d918dc1a0' OR (EntityID = '9FC3A952-86E6-451F-A818-FF78131E38C7' AND Name = 'Passed')) BEGIN
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
            'd8acd3fb-31ec-4aa0-8f3f-571d918dc1a0',
            '9FC3A952-86E6-451F-A818-FF78131E38C7', -- Entity: MJ: ML Search Strategy Comparisons
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9FC3A952-86E6-451F-A818-FF78131E38C7'),
            'Passed',
            'Passed',
            'Computed server-side as LowerBoundMin > 0; client writes supplying a different value are refused.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a592253a-6831-4d37-826c-52039b3ee856' OR (EntityID = '9FC3A952-86E6-451F-A818-FF78131E38C7' AND Name = 'ComparedAt')) BEGIN
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
            'a592253a-6831-4d37-826c-52039b3ee856',
            '9FC3A952-86E6-451F-A818-FF78131E38C7', -- Entity: MJ: ML Search Strategy Comparisons
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9FC3A952-86E6-451F-A818-FF78131E38C7'),
            'ComparedAt',
            'Compared At',
            'Timestamp when the paired comparison was recorded.',
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'sysdatetimeoffset()',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a0917eef-8ae2-4707-a48c-65f27fa236cb' OR (EntityID = '9FC3A952-86E6-451F-A818-FF78131E38C7' AND Name = 'ComparedByUserID')) BEGIN
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
            'a0917eef-8ae2-4707-a48c-65f27fa236cb',
            '9FC3A952-86E6-451F-A818-FF78131E38C7', -- Entity: MJ: ML Search Strategy Comparisons
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9FC3A952-86E6-451F-A818-FF78131E38C7'),
            'ComparedByUserID',
            'Compared By User ID',
            'User who recorded or initiated the search-strategy comparison.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0076d81a-f75d-43c3-b2f5-6cd726cb1bf5' OR (EntityID = '9FC3A952-86E6-451F-A818-FF78131E38C7' AND Name = '__mj_CreatedAt')) BEGIN
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
            '0076d81a-f75d-43c3-b2f5-6cd726cb1bf5',
            '9FC3A952-86E6-451F-A818-FF78131E38C7', -- Entity: MJ: ML Search Strategy Comparisons
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9FC3A952-86E6-451F-A818-FF78131E38C7'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e286974a-1066-41c4-8f33-f782666ff183' OR (EntityID = '9FC3A952-86E6-451F-A818-FF78131E38C7' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'e286974a-1066-41c4-8f33-f782666ff183',
            '9FC3A952-86E6-451F-A818-FF78131E38C7', -- Entity: MJ: ML Search Strategy Comparisons
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9FC3A952-86E6-451F-A818-FF78131E38C7'),
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

/* SQL text to insert entity field value with ID 214285c8-5469-41dd-986c-6f1ebc974b27 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('214285c8-5469-41dd-986c-6f1ebc974b27', '2DA1B491-5782-4974-8978-B50B263CF60A', 1, 'bayesian', 'bayesian', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID f08fdf8c-5453-4ebc-84e9-ae07d907369b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f08fdf8c-5453-4ebc-84e9-ae07d907369b', '2DA1B491-5782-4974-8978-B50B263CF60A', 2, 'successive-halving', 'successive-halving', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 2DA1B491-5782-4974-8978-B50B263CF60A */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='2DA1B491-5782-4974-8978-B50B263CF60A';


/* Create Entity Relationship: MJ: Users -> MJ: ML Search Strategy Comparisons (One To Many via ComparedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'c7dab5a3-5683-4de4-9082-72cfccc09fd5'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('c7dab5a3-5683-4de4-9082-72cfccc09fd5', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '9FC3A952-86E6-451F-A818-FF78131E38C7', 'ComparedByUserID', 'One To Many', 1, 1, 141, GETUTCDATE(), GETUTCDATE())
   END;


/* Index for Foreign Keys for MLSearchStrategyComparison */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Search Strategy Comparisons
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ComparedByUserID in table MLSearchStrategyComparison
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLSearchStrategyComparison_ComparedByUserID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLSearchStrategyComparison]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLSearchStrategyComparison]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'ComparedByUserID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLSearchStrategyComparison_ComparedByUserID ON [${flyway:defaultSchema}].[MLSearchStrategyComparison] ([ComparedByUserID]);

/* Base View SQL for MJ: ML Search Strategy Comparisons */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Search Strategy Comparisons
-- Item: vwMLSearchStrategyComparisons
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: ML Search Strategy Comparisons
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MLSearchStrategyComparison
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMLSearchStrategyComparisons]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMLSearchStrategyComparisons];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMLSearchStrategyComparisons]
AS
SELECT
    m.*,
    MJUser_ComparedByUserID.[Name] AS [ComparedByUser]
FROM
    [${flyway:defaultSchema}].[MLSearchStrategyComparison] AS m
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_ComparedByUserID
  ON
    [m].[ComparedByUserID] = MJUser_ComparedByUserID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLSearchStrategyComparisons] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLSearchStrategyComparisons] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLSearchStrategyComparisons] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwMLSearchStrategyComparisons] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: ML Search Strategy Comparisons */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Search Strategy Comparisons
-- Item: Permissions for vwMLSearchStrategyComparisons
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLSearchStrategyComparisons] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLSearchStrategyComparisons] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLSearchStrategyComparisons] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwMLSearchStrategyComparisons] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: ML Search Strategy Comparisons */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Search Strategy Comparisons
-- Item: spCreateMLSearchStrategyComparison
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MLSearchStrategyComparison
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMLSearchStrategyComparison]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMLSearchStrategyComparison];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMLSearchStrategyComparison]
    @ID uniqueidentifier = NULL,
    @Method nvarchar(40),
    @ComputeBudgetSecondsPerArm decimal(18, 4),
    @Datasets nvarchar(MAX),
    @PairedDifference nvarchar(MAX),
    @LowerBoundMin decimal(18, 6),
    @Passed bit = NULL,
    @ComparedAt datetimeoffset = NULL,
    @ComparedByUserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MLSearchStrategyComparison]
            (
                [ID],
                [Method],
                [ComputeBudgetSecondsPerArm],
                [Datasets],
                [PairedDifference],
                [LowerBoundMin],
                [Passed],
                [ComparedAt],
                [ComparedByUserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Method,
                @ComputeBudgetSecondsPerArm,
                @Datasets,
                @PairedDifference,
                @LowerBoundMin,
                ISNULL(@Passed, 0),
                ISNULL(@ComparedAt, sysdatetimeoffset()),
                @ComparedByUserID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MLSearchStrategyComparison]
            (
                [Method],
                [ComputeBudgetSecondsPerArm],
                [Datasets],
                [PairedDifference],
                [LowerBoundMin],
                [Passed],
                [ComparedAt],
                [ComparedByUserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Method,
                @ComputeBudgetSecondsPerArm,
                @Datasets,
                @PairedDifference,
                @LowerBoundMin,
                ISNULL(@Passed, 0),
                ISNULL(@ComparedAt, sysdatetimeoffset()),
                @ComparedByUserID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMLSearchStrategyComparisons] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLSearchStrategyComparison] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLSearchStrategyComparison] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLSearchStrategyComparison] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: ML Search Strategy Comparisons */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLSearchStrategyComparison] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLSearchStrategyComparison] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLSearchStrategyComparison] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: ML Search Strategy Comparisons */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Search Strategy Comparisons
-- Item: spUpdateMLSearchStrategyComparison
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MLSearchStrategyComparison
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMLSearchStrategyComparison]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMLSearchStrategyComparison];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMLSearchStrategyComparison]
    @ID uniqueidentifier,
    @Method nvarchar(40) = NULL,
    @ComputeBudgetSecondsPerArm decimal(18, 4) = NULL,
    @Datasets nvarchar(MAX) = NULL,
    @PairedDifference nvarchar(MAX) = NULL,
    @LowerBoundMin decimal(18, 6) = NULL,
    @Passed bit = NULL,
    @ComparedAt datetimeoffset = NULL,
    @ComparedByUserID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLSearchStrategyComparison]
    SET
        [Method] = ISNULL(@Method, [Method]),
        [ComputeBudgetSecondsPerArm] = ISNULL(@ComputeBudgetSecondsPerArm, [ComputeBudgetSecondsPerArm]),
        [Datasets] = ISNULL(@Datasets, [Datasets]),
        [PairedDifference] = ISNULL(@PairedDifference, [PairedDifference]),
        [LowerBoundMin] = ISNULL(@LowerBoundMin, [LowerBoundMin]),
        [Passed] = ISNULL(@Passed, [Passed]),
        [ComparedAt] = ISNULL(@ComparedAt, [ComparedAt]),
        [ComparedByUserID] = ISNULL(@ComparedByUserID, [ComparedByUserID]),
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMLSearchStrategyComparisons] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMLSearchStrategyComparisons]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLSearchStrategyComparison] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLSearchStrategyComparison] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLSearchStrategyComparison] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLSearchStrategyComparison table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMLSearchStrategyComparison]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMLSearchStrategyComparison];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMLSearchStrategyComparison
ON [${flyway:defaultSchema}].[MLSearchStrategyComparison]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[MLSearchStrategyComparison]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[MLSearchStrategyComparison] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

/* spUpdate Permissions for MJ: ML Search Strategy Comparisons */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLSearchStrategyComparison] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLSearchStrategyComparison] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLSearchStrategyComparison] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: ML Search Strategy Comparisons */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Search Strategy Comparisons
-- Item: spDeleteMLSearchStrategyComparison
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MLSearchStrategyComparison
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMLSearchStrategyComparison]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMLSearchStrategyComparison];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMLSearchStrategyComparison]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MLSearchStrategyComparison]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLSearchStrategyComparison] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLSearchStrategyComparison] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLSearchStrategyComparison] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: ML Search Strategy Comparisons */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLSearchStrategyComparison] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLSearchStrategyComparison] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLSearchStrategyComparison] TO [cdp_Developer], [cdp_Integration];


/* SQL text to insert 1 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8266db46-7766-4b4d-9e45-e8085fb988a6' OR (EntityID = '9FC3A952-86E6-451F-A818-FF78131E38C7' AND Name = 'ComparedByUser')) BEGIN
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
            '8266db46-7766-4b4d-9e45-e8085fb988a6',
            '9FC3A952-86E6-451F-A818-FF78131E38C7', -- Entity: MJ: ML Search Strategy Comparisons
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9FC3A952-86E6-451F-A818-FF78131E38C7'),
            'ComparedByUser',
            'Compared By User',
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

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '2DA1B491-5782-4974-8978-B50B263CF60A'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '2DA1B491-5782-4974-8978-B50B263CF60A'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '03F4E814-24C8-4ECA-BAA6-AA2BAE6A0ECC'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'E11398EF-0F37-45BA-A54B-04F15F4C258A'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D8ACD3FB-31EC-4AA0-8F3F-571D918DC1A0'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A592253A-6831-4D37-826C-52039B3EE856'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '2DA1B491-5782-4974-8978-B50B263CF60A'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '2DA1B491-5782-4974-8978-B50B263CF60A'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set categories for 12 fields */

-- UPDATE Entity Field Category Info MJ: ML Search Strategy Comparisons.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9B7436DC-E8B6-4B37-A653-A1F7A06F8CC0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Search Strategy Comparisons.Method 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Search Strategy Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2DA1B491-5782-4974-8978-B50B263CF60A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Search Strategy Comparisons.ComputeBudgetSecondsPerArm 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Search Strategy Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '03F4E814-24C8-4ECA-BAA6-AA2BAE6A0ECC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Search Strategy Comparisons.Datasets 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Evaluation Datasets and Results',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON',
   CodeType = 'Other'
WHERE 
   ID = '1A8DAC7A-D43D-45ED-B056-B34FCD201C87' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Search Strategy Comparisons.PairedDifference 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Evaluation Datasets and Results',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON',
   CodeType = 'Other'
WHERE 
   ID = '491CF7A6-FFB4-4936-AC19-F71762DD7205' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Search Strategy Comparisons.LowerBoundMin 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Evaluation Datasets and Results',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E11398EF-0F37-45BA-A54B-04F15F4C258A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Search Strategy Comparisons.Passed 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Evaluation Datasets and Results',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D8ACD3FB-31EC-4AA0-8F3F-571D918DC1A0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Search Strategy Comparisons.ComparedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audit and Tracking',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A592253A-6831-4D37-826C-52039B3EE856' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Search Strategy Comparisons.ComparedByUserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audit and Tracking',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A0917EEF-8AE2-4707-A48C-65F27FA236CB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Search Strategy Comparisons.ComparedByUser 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audit and Tracking',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8266DB46-7766-4B4D-9E45-E8085FB988A6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Search Strategy Comparisons.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0076D81A-F75D-43C3-B2F5-6CD726CB1BF5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Search Strategy Comparisons.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E286974A-1066-41C4-8F33-F782666FF183' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-chart-bar */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-chart-bar', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '9FC3A952-86E6-451F-A818-FF78131E38C7';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('4e343cfd-d6a9-459f-bc08-4f0457946be5', '9FC3A952-86E6-451F-A818-FF78131E38C7', 'FieldCategoryInfo', '{"Search Strategy Configuration":{"icon":"fa fa-sliders-h","description":"Configuration parameters and budget allocation for search strategies"},"Evaluation Datasets and Results":{"icon":"fa fa-chart-line","description":"Datasets evaluated, performance comparison maps, bounds, and pass status"},"Audit and Tracking":{"icon":"fa fa-user-clock","description":"Information regarding who performed the comparison and when"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('4f1bfdb0-b8e8-4985-920e-5102ab9de694', '9FC3A952-86E6-451F-A818-FF78131E38C7', 'FieldCategoryIcons', '{"Search Strategy Configuration":"fa fa-sliders-h","Evaluation Datasets and Results":"fa fa-chart-line","Audit and Tracking":"fa fa-user-clock","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '9FC3A952-86E6-451F-A818-FF78131E38C7';

