-- =====================================================================================
-- Usage Budgets Schema Foundation
-- =====================================================================================
-- Introduces generic query-measured budget tracking and event alerting:
-- 1. UsageBudget: Generic spend/consumption budgets evaluated via saved Query definitions
-- 2. UsageBudgetEvent: Threshold breach and enforcement history for active budgets
--
-- Design plan: plans/ai-usage-analytics.md (§9 & §2a.6) / MJ#4396 Part 8
-- =====================================================================================

CREATE TABLE [${flyway:defaultSchema}].[UsageBudget] (
    [ID]                 UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_UsageBudget_ID] DEFAULT (newsequentialid()),
    [Name]               NVARCHAR(255)    NOT NULL,
    [Description]        NVARCHAR(MAX)    NULL,
    [MeasureQueryID]     UNIQUEIDENTIFIER NOT NULL,
    [MeasureParameters]  NVARCHAR(MAX)    NULL,
    [MeasureColumn]      NVARCHAR(100)    NOT NULL,
    [ScopeEntityID]      UNIQUEIDENTIFIER NULL,
    [ScopeRecordID]      NVARCHAR(100)    NULL,
    [Period]             NVARCHAR(20)     NOT NULL,
    [AmountLimit]        DECIMAL(19, 8)   NOT NULL,
    [Unit]               NVARCHAR(20)     NOT NULL,
    [WarnAtPercent]      INT              NOT NULL CONSTRAINT [DF_UsageBudget_WarnAtPercent] DEFAULT (80),
    [Action]             NVARCHAR(20)     NOT NULL,
    [Status]             NVARCHAR(20)     NOT NULL CONSTRAINT [DF_UsageBudget_Status] DEFAULT (N'Active'),
    [LastEvaluatedAt]    DATETIMEOFFSET   NULL,
    [LastObservedAmount] DECIMAL(19, 8)   NULL,

    CONSTRAINT [PK_UsageBudget] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_UsageBudget_MeasureQuery] FOREIGN KEY ([MeasureQueryID])
        REFERENCES [${flyway:defaultSchema}].[Query]([ID]),
    CONSTRAINT [FK_UsageBudget_ScopeEntity] FOREIGN KEY ([ScopeEntityID])
        REFERENCES [${flyway:defaultSchema}].[Entity]([ID]),
    CONSTRAINT [CK_UsageBudget_Period] CHECK ([Period] IN (N'Day', N'Week', N'Month')),
    CONSTRAINT [CK_UsageBudget_Action] CHECK ([Action] IN (N'Notify', N'Throttle', N'Block')),
    CONSTRAINT [CK_UsageBudget_Status] CHECK ([Status] IN (N'Active', N'Disabled'))
);
GO

CREATE TABLE [${flyway:defaultSchema}].[UsageBudgetEvent] (
    [ID]               UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_UsageBudgetEvent_ID] DEFAULT (newsequentialid()),
    [BudgetID]         UNIQUEIDENTIFIER NOT NULL,
    [PeriodStart]      DATETIMEOFFSET   NOT NULL,
    [ObservedAmount]   DECIMAL(19, 8)   NOT NULL,
    [ThresholdPercent] INT              NOT NULL,
    [Action]           NVARCHAR(20)     NOT NULL,
    [NotifiedAt]       DATETIMEOFFSET   NULL,

    CONSTRAINT [PK_UsageBudgetEvent] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_UsageBudgetEvent_Budget] FOREIGN KEY ([BudgetID])
        REFERENCES [${flyway:defaultSchema}].[UsageBudget]([ID]),
    CONSTRAINT [CK_UsageBudgetEvent_Action] CHECK ([Action] IN (N'Notify', N'Throttle', N'Block'))
);
GO

-- -------------------------------------------------------------------------------------
-- Extended Properties / Descriptions: UsageBudget
-- -------------------------------------------------------------------------------------
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Defines generic usage and spend budgets evaluated against saved MeasureQueries over sliding or calendar periods.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UsageBudget';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Human-readable name for this usage budget.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UsageBudget',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Detailed description of the purpose, scope, and rules for this usage budget.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UsageBudget',
    @level2type = N'COLUMN', @level2name = N'Description';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to the saved Query used to calculate the consumed amount for this budget.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UsageBudget',
    @level2type = N'COLUMN', @level2name = N'MeasureQueryID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON object containing parameters to pass into the MeasureQuery when evaluating consumption.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UsageBudget',
    @level2type = N'COLUMN', @level2name = N'MeasureParameters';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The name of the result column in MeasureQuery output that contains the consumed numerical amount.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UsageBudget',
    @level2type = N'COLUMN', @level2name = N'MeasureColumn';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional foreign key to an Entity defining the scope of this budget (e.g., AIAgent, User, Tenant).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UsageBudget',
    @level2type = N'COLUMN', @level2name = N'ScopeEntityID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional identifier of the specific record within ScopeEntityID that this budget governs.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UsageBudget',
    @level2type = N'COLUMN', @level2name = N'ScopeRecordID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Calendar or evaluation period over which the budget is measured (Day, Week, Month).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UsageBudget',
    @level2type = N'COLUMN', @level2name = N'Period';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Maximum allowed consumption or spend amount for the specified period.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UsageBudget',
    @level2type = N'COLUMN', @level2name = N'AmountLimit';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Measurement unit for AmountLimit and ObservedAmount (e.g., USD, Tokens, Requests).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UsageBudget',
    @level2type = N'COLUMN', @level2name = N'Unit';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Percentage of AmountLimit at which warning notifications are triggered (default 80).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UsageBudget',
    @level2type = N'COLUMN', @level2name = N'WarnAtPercent';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Enforcement action taken when the budget limit is reached (Notify, Throttle, Block).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UsageBudget',
    @level2type = N'COLUMN', @level2name = N'Action';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current operational status of this budget (Active, Disabled).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UsageBudget',
    @level2type = N'COLUMN', @level2name = N'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when this budget was most recently evaluated by the evaluation job.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UsageBudget',
    @level2type = N'COLUMN', @level2name = N'LastEvaluatedAt';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Most recent consumed amount calculated by the evaluation job.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UsageBudget',
    @level2type = N'COLUMN', @level2name = N'LastObservedAmount';

-- -------------------------------------------------------------------------------------
-- Extended Properties / Descriptions: UsageBudgetEvent
-- -------------------------------------------------------------------------------------
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Records threshold breach events and enforcement actions triggered during UsageBudget evaluation.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UsageBudgetEvent';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to the UsageBudget that triggered this event.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UsageBudgetEvent',
    @level2type = N'COLUMN', @level2name = N'BudgetID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Start timestamp (in UTC) of the budget period during which the threshold breach occurred.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UsageBudgetEvent',
    @level2type = N'COLUMN', @level2name = N'PeriodStart';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The observed consumption amount at the time this threshold event was recorded.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UsageBudgetEvent',
    @level2type = N'COLUMN', @level2name = N'ObservedAmount';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The percentage threshold reached or exceeded (e.g., WarnAtPercent or 100).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UsageBudgetEvent',
    @level2type = N'COLUMN', @level2name = N'ThresholdPercent';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The action triggered for this event (Notify, Throttle, Block).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UsageBudgetEvent',
    @level2type = N'COLUMN', @level2name = N'Action';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when notification was sent to stakeholders for this event, or NULL if pending/skipped.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UsageBudgetEvent',
    @level2type = N'COLUMN', @level2name = N'NotifiedAt';
GO


















































-- =============================================================================
-- GENERATED BY MemberJunction CodeGen — DO NOT EDIT BY HAND
-- =============================================================================
-- Everything below this block was produced by MemberJunction CodeGen after
-- the hand-written DDL above. It contains:
--   * Entity records for UsageBudget, UsageBudgetEvent
--   * ApplicationEntity & EntityPermission grants
--   * EntityField records (apply-time dynamic Sequence)
--   * System columns __mj_CreatedAt, __mj_UpdatedAt
--   * vwUsageBudgets, vwUsageBudgetEvents
--   * spCreate / spUpdate / spDelete for both entities
--   * trgUpdateUsageBudget, trgUpdateUsageBudgetEvent
--   * spDeleteQuery (regenerated for FK cascade)
--   * Permissions
-- =============================================================================

/* SQL generated to create new entity MJ: Usage Budget Events */

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
         '8a42fa93-fe36-4756-8a48-f82283642c09',
         'MJ: Usage Budget Events',
         'Usage Budget Events',
         'Records threshold breach events and enforcement actions triggered during UsageBudget evaluation.',
         NULL,
         'UsageBudgetEvent',
         'vwUsageBudgetEvents',
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

/* SQL generated to add new entity MJ: Usage Budget Events to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '8a42fa93-fe36-4756-8a48-f82283642c09', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Usage Budget Events for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('8a42fa93-fe36-4756-8a48-f82283642c09' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('8a42fa93-fe36-4756-8a48-f82283642c09' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Usage Budget Events for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('8a42fa93-fe36-4756-8a48-f82283642c09' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('8a42fa93-fe36-4756-8a48-f82283642c09' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Usage Budget Events for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('8a42fa93-fe36-4756-8a48-f82283642c09' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('8a42fa93-fe36-4756-8a48-f82283642c09' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to create new entity MJ: Usage Budgets */

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
         '47fcbe1e-6f18-4461-acdd-856d854c2172',
         'MJ: Usage Budgets',
         'Usage Budgets',
         'Defines generic usage and spend budgets evaluated against saved MeasureQueries over sliding or calendar periods.',
         NULL,
         'UsageBudget',
         'vwUsageBudgets',
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

/* SQL generated to add new entity MJ: Usage Budgets to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '47fcbe1e-6f18-4461-acdd-856d854c2172', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Usage Budgets for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('47fcbe1e-6f18-4461-acdd-856d854c2172' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('47fcbe1e-6f18-4461-acdd-856d854c2172' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Usage Budgets for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('47fcbe1e-6f18-4461-acdd-856d854c2172' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('47fcbe1e-6f18-4461-acdd-856d854c2172' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Usage Budgets for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('47fcbe1e-6f18-4461-acdd-856d854c2172' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('47fcbe1e-6f18-4461-acdd-856d854c2172' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.UsageBudget */
ALTER TABLE [${flyway:defaultSchema}].[UsageBudget] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.UsageBudget */
UPDATE [${flyway:defaultSchema}].[UsageBudget] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.UsageBudget */
ALTER TABLE [${flyway:defaultSchema}].[UsageBudget] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.UsageBudget */
ALTER TABLE [${flyway:defaultSchema}].[UsageBudget] ADD CONSTRAINT [DF___mj_UsageBudget___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.UsageBudget */
ALTER TABLE [${flyway:defaultSchema}].[UsageBudget] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.UsageBudget */
UPDATE [${flyway:defaultSchema}].[UsageBudget] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.UsageBudget */
ALTER TABLE [${flyway:defaultSchema}].[UsageBudget] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.UsageBudget */
ALTER TABLE [${flyway:defaultSchema}].[UsageBudget] ADD CONSTRAINT [DF___mj_UsageBudget___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.UsageBudgetEvent */
ALTER TABLE [${flyway:defaultSchema}].[UsageBudgetEvent] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.UsageBudgetEvent */
UPDATE [${flyway:defaultSchema}].[UsageBudgetEvent] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.UsageBudgetEvent */
ALTER TABLE [${flyway:defaultSchema}].[UsageBudgetEvent] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.UsageBudgetEvent */
ALTER TABLE [${flyway:defaultSchema}].[UsageBudgetEvent] ADD CONSTRAINT [DF___mj_UsageBudgetEvent___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.UsageBudgetEvent */
ALTER TABLE [${flyway:defaultSchema}].[UsageBudgetEvent] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.UsageBudgetEvent */
UPDATE [${flyway:defaultSchema}].[UsageBudgetEvent] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.UsageBudgetEvent */
ALTER TABLE [${flyway:defaultSchema}].[UsageBudgetEvent] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.UsageBudgetEvent */
ALTER TABLE [${flyway:defaultSchema}].[UsageBudgetEvent] ADD CONSTRAINT [DF___mj_UsageBudgetEvent___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 27 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '68c0720f-aee0-4fdb-9eec-443e5a9b5b7d' OR (EntityID = '47FCBE1E-6F18-4461-ACDD-856D854C2172' AND Name = 'ID')) BEGIN
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
            '68c0720f-aee0-4fdb-9eec-443e5a9b5b7d',
            '47FCBE1E-6F18-4461-ACDD-856D854C2172', -- Entity: MJ: Usage Budgets
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '47FCBE1E-6F18-4461-ACDD-856D854C2172'),
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
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '121ecb1e-c3e1-477e-b348-464f8b92e9eb' OR (EntityID = '47FCBE1E-6F18-4461-ACDD-856D854C2172' AND Name = 'Name')) BEGIN
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
            '121ecb1e-c3e1-477e-b348-464f8b92e9eb',
            '47FCBE1E-6F18-4461-ACDD-856D854C2172', -- Entity: MJ: Usage Budgets
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '47FCBE1E-6F18-4461-ACDD-856D854C2172'),
            'Name',
            'Name',
            'Human-readable name for this usage budget.',
            'nvarchar',
            510,
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
            1,
            1,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '429a6ed5-620a-482d-82e3-ce62251df2ee' OR (EntityID = '47FCBE1E-6F18-4461-ACDD-856D854C2172' AND Name = 'Description')) BEGIN
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
            '429a6ed5-620a-482d-82e3-ce62251df2ee',
            '47FCBE1E-6F18-4461-ACDD-856D854C2172', -- Entity: MJ: Usage Budgets
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '47FCBE1E-6F18-4461-ACDD-856D854C2172'),
            'Description',
            'Description',
            'Detailed description of the purpose, scope, and rules for this usage budget.',
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '099aef92-19b9-43be-b1b1-042900896798' OR (EntityID = '47FCBE1E-6F18-4461-ACDD-856D854C2172' AND Name = 'MeasureQueryID')) BEGIN
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
            '099aef92-19b9-43be-b1b1-042900896798',
            '47FCBE1E-6F18-4461-ACDD-856D854C2172', -- Entity: MJ: Usage Budgets
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '47FCBE1E-6F18-4461-ACDD-856D854C2172'),
            'MeasureQueryID',
            'Measure Query ID',
            'Foreign key to the saved Query used to calculate the consumed amount for this budget.',
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
            '1B248F34-2837-EF11-86D4-6045BDEE16E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6c104b70-5ed1-487d-b941-7827e433d710' OR (EntityID = '47FCBE1E-6F18-4461-ACDD-856D854C2172' AND Name = 'MeasureParameters')) BEGIN
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
            '6c104b70-5ed1-487d-b941-7827e433d710',
            '47FCBE1E-6F18-4461-ACDD-856D854C2172', -- Entity: MJ: Usage Budgets
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '47FCBE1E-6F18-4461-ACDD-856D854C2172'),
            'MeasureParameters',
            'Measure Parameters',
            'JSON object containing parameters to pass into the MeasureQuery when evaluating consumption.',
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0e585f33-aa69-4fb8-a7c9-a2bd70dc09f3' OR (EntityID = '47FCBE1E-6F18-4461-ACDD-856D854C2172' AND Name = 'MeasureColumn')) BEGIN
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
            '0e585f33-aa69-4fb8-a7c9-a2bd70dc09f3',
            '47FCBE1E-6F18-4461-ACDD-856D854C2172', -- Entity: MJ: Usage Budgets
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '47FCBE1E-6F18-4461-ACDD-856D854C2172'),
            'MeasureColumn',
            'Measure Column',
            'The name of the result column in MeasureQuery output that contains the consumed numerical amount.',
            'nvarchar',
            200,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9c2b9f6b-cd72-465a-b782-cdd7ad1a26d9' OR (EntityID = '47FCBE1E-6F18-4461-ACDD-856D854C2172' AND Name = 'ScopeEntityID')) BEGIN
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
            '9c2b9f6b-cd72-465a-b782-cdd7ad1a26d9',
            '47FCBE1E-6F18-4461-ACDD-856D854C2172', -- Entity: MJ: Usage Budgets
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '47FCBE1E-6F18-4461-ACDD-856D854C2172'),
            'ScopeEntityID',
            'Scope Entity ID',
            'Optional foreign key to an Entity defining the scope of this budget (e.g., AIAgent, User, Tenant).',
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
            'E0238F34-2837-EF11-86D4-6045BDEE16E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '17f6abbc-4a80-43bf-a67a-d5fa9918387c' OR (EntityID = '47FCBE1E-6F18-4461-ACDD-856D854C2172' AND Name = 'ScopeRecordID')) BEGIN
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
            '17f6abbc-4a80-43bf-a67a-d5fa9918387c',
            '47FCBE1E-6F18-4461-ACDD-856D854C2172', -- Entity: MJ: Usage Budgets
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '47FCBE1E-6F18-4461-ACDD-856D854C2172'),
            'ScopeRecordID',
            'Scope Record ID',
            'Optional identifier of the specific record within ScopeEntityID that this budget governs.',
            'nvarchar',
            200,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3209054f-03e0-43e1-9605-7ea8eb142bd6' OR (EntityID = '47FCBE1E-6F18-4461-ACDD-856D854C2172' AND Name = 'Period')) BEGIN
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
            '3209054f-03e0-43e1-9605-7ea8eb142bd6',
            '47FCBE1E-6F18-4461-ACDD-856D854C2172', -- Entity: MJ: Usage Budgets
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '47FCBE1E-6F18-4461-ACDD-856D854C2172'),
            'Period',
            'Period',
            'Calendar or evaluation period over which the budget is measured (Day, Week, Month).',
            'nvarchar',
            40,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '43a9bf8c-f6f0-4bfd-9ae4-6cf59f1ad435' OR (EntityID = '47FCBE1E-6F18-4461-ACDD-856D854C2172' AND Name = 'AmountLimit')) BEGIN
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
            '43a9bf8c-f6f0-4bfd-9ae4-6cf59f1ad435',
            '47FCBE1E-6F18-4461-ACDD-856D854C2172', -- Entity: MJ: Usage Budgets
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '47FCBE1E-6F18-4461-ACDD-856D854C2172'),
            'AmountLimit',
            'Amount Limit',
            'Maximum allowed consumption or spend amount for the specified period.',
            'decimal',
            9,
            19,
            8,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fdc1ba06-b94a-4fbe-9891-9cb4738a2eeb' OR (EntityID = '47FCBE1E-6F18-4461-ACDD-856D854C2172' AND Name = 'Unit')) BEGIN
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
            'fdc1ba06-b94a-4fbe-9891-9cb4738a2eeb',
            '47FCBE1E-6F18-4461-ACDD-856D854C2172', -- Entity: MJ: Usage Budgets
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '47FCBE1E-6F18-4461-ACDD-856D854C2172'),
            'Unit',
            'Unit',
            'Measurement unit for AmountLimit and ObservedAmount (e.g., USD, Tokens, Requests).',
            'nvarchar',
            40,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7580e944-11eb-477b-a77f-da24df3fbde6' OR (EntityID = '47FCBE1E-6F18-4461-ACDD-856D854C2172' AND Name = 'WarnAtPercent')) BEGIN
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
            '7580e944-11eb-477b-a77f-da24df3fbde6',
            '47FCBE1E-6F18-4461-ACDD-856D854C2172', -- Entity: MJ: Usage Budgets
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '47FCBE1E-6F18-4461-ACDD-856D854C2172'),
            'WarnAtPercent',
            'Warn At Percent',
            'Percentage of AmountLimit at which warning notifications are triggered (default 80).',
            'int',
            4,
            10,
            0,
            0,
            '(80)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0aba3983-f41a-4fbf-9661-cbccd1f4688a' OR (EntityID = '47FCBE1E-6F18-4461-ACDD-856D854C2172' AND Name = 'Action')) BEGIN
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
            '0aba3983-f41a-4fbf-9661-cbccd1f4688a',
            '47FCBE1E-6F18-4461-ACDD-856D854C2172', -- Entity: MJ: Usage Budgets
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '47FCBE1E-6F18-4461-ACDD-856D854C2172'),
            'Action',
            'Action',
            'Enforcement action taken when the budget limit is reached (Notify, Throttle, Block).',
            'nvarchar',
            40,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b2b5dbaf-ac76-415f-9dca-42c09a4531e6' OR (EntityID = '47FCBE1E-6F18-4461-ACDD-856D854C2172' AND Name = 'Status')) BEGIN
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
            'b2b5dbaf-ac76-415f-9dca-42c09a4531e6',
            '47FCBE1E-6F18-4461-ACDD-856D854C2172', -- Entity: MJ: Usage Budgets
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '47FCBE1E-6F18-4461-ACDD-856D854C2172'),
            'Status',
            'Status',
            'Current operational status of this budget (Active, Disabled).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Active',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8aeac1c0-28eb-45b8-8557-7f24b78fcbd7' OR (EntityID = '47FCBE1E-6F18-4461-ACDD-856D854C2172' AND Name = 'LastEvaluatedAt')) BEGIN
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
            '8aeac1c0-28eb-45b8-8557-7f24b78fcbd7',
            '47FCBE1E-6F18-4461-ACDD-856D854C2172', -- Entity: MJ: Usage Budgets
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '47FCBE1E-6F18-4461-ACDD-856D854C2172'),
            'LastEvaluatedAt',
            'Last Evaluated At',
            'Timestamp when this budget was most recently evaluated by the evaluation job.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '40215937-065d-41d3-ac87-adeec83a51ae' OR (EntityID = '47FCBE1E-6F18-4461-ACDD-856D854C2172' AND Name = 'LastObservedAmount')) BEGIN
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
            '40215937-065d-41d3-ac87-adeec83a51ae',
            '47FCBE1E-6F18-4461-ACDD-856D854C2172', -- Entity: MJ: Usage Budgets
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '47FCBE1E-6F18-4461-ACDD-856D854C2172'),
            'LastObservedAmount',
            'Last Observed Amount',
            'Most recent consumed amount calculated by the evaluation job.',
            'decimal',
            9,
            19,
            8,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c4efbabb-464e-4105-80f1-5175b43019dd' OR (EntityID = '47FCBE1E-6F18-4461-ACDD-856D854C2172' AND Name = '__mj_CreatedAt')) BEGIN
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
            'c4efbabb-464e-4105-80f1-5175b43019dd',
            '47FCBE1E-6F18-4461-ACDD-856D854C2172', -- Entity: MJ: Usage Budgets
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '47FCBE1E-6F18-4461-ACDD-856D854C2172'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '11717454-748f-4317-9b34-20cf3e4b2cc1' OR (EntityID = '47FCBE1E-6F18-4461-ACDD-856D854C2172' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '11717454-748f-4317-9b34-20cf3e4b2cc1',
            '47FCBE1E-6F18-4461-ACDD-856D854C2172', -- Entity: MJ: Usage Budgets
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '47FCBE1E-6F18-4461-ACDD-856D854C2172'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7c5c9468-7ff7-4687-8efd-01179f14263c' OR (EntityID = '8A42FA93-FE36-4756-8A48-F82283642C09' AND Name = 'ID')) BEGIN
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
            '7c5c9468-7ff7-4687-8efd-01179f14263c',
            '8A42FA93-FE36-4756-8A48-F82283642C09', -- Entity: MJ: Usage Budget Events
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8A42FA93-FE36-4756-8A48-F82283642C09'),
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
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '57e8a346-b2fd-46fc-ad10-747adeb83a92' OR (EntityID = '8A42FA93-FE36-4756-8A48-F82283642C09' AND Name = 'BudgetID')) BEGIN
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
            '57e8a346-b2fd-46fc-ad10-747adeb83a92',
            '8A42FA93-FE36-4756-8A48-F82283642C09', -- Entity: MJ: Usage Budget Events
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8A42FA93-FE36-4756-8A48-F82283642C09'),
            'BudgetID',
            'Budget ID',
            'Foreign key to the UsageBudget that triggered this event.',
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
            '47FCBE1E-6F18-4461-ACDD-856D854C2172',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '64751eb1-360f-44a2-b91c-2f3d997ddce5' OR (EntityID = '8A42FA93-FE36-4756-8A48-F82283642C09' AND Name = 'PeriodStart')) BEGIN
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
            '64751eb1-360f-44a2-b91c-2f3d997ddce5',
            '8A42FA93-FE36-4756-8A48-F82283642C09', -- Entity: MJ: Usage Budget Events
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8A42FA93-FE36-4756-8A48-F82283642C09'),
            'PeriodStart',
            'Period Start',
            'Start timestamp (in UTC) of the budget period during which the threshold breach occurred.',
            'datetimeoffset',
            10,
            34,
            7,
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2a8b2312-24ca-4b32-acf6-ff4995441844' OR (EntityID = '8A42FA93-FE36-4756-8A48-F82283642C09' AND Name = 'ObservedAmount')) BEGIN
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
            '2a8b2312-24ca-4b32-acf6-ff4995441844',
            '8A42FA93-FE36-4756-8A48-F82283642C09', -- Entity: MJ: Usage Budget Events
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8A42FA93-FE36-4756-8A48-F82283642C09'),
            'ObservedAmount',
            'Observed Amount',
            'The observed consumption amount at the time this threshold event was recorded.',
            'decimal',
            9,
            19,
            8,
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd3303ad8-a56b-42fe-88d0-d6f6bee663e9' OR (EntityID = '8A42FA93-FE36-4756-8A48-F82283642C09' AND Name = 'ThresholdPercent')) BEGIN
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
            'd3303ad8-a56b-42fe-88d0-d6f6bee663e9',
            '8A42FA93-FE36-4756-8A48-F82283642C09', -- Entity: MJ: Usage Budget Events
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8A42FA93-FE36-4756-8A48-F82283642C09'),
            'ThresholdPercent',
            'Threshold Percent',
            'The percentage threshold reached or exceeded (e.g., WarnAtPercent or 100).',
            'int',
            4,
            10,
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fd2829b9-b6cb-4540-9739-f32772945663' OR (EntityID = '8A42FA93-FE36-4756-8A48-F82283642C09' AND Name = 'Action')) BEGIN
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
            'fd2829b9-b6cb-4540-9739-f32772945663',
            '8A42FA93-FE36-4756-8A48-F82283642C09', -- Entity: MJ: Usage Budget Events
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8A42FA93-FE36-4756-8A48-F82283642C09'),
            'Action',
            'Action',
            'The action triggered for this event (Notify, Throttle, Block).',
            'nvarchar',
            40,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '90e4c5db-7c38-4663-be91-03572001e08f' OR (EntityID = '8A42FA93-FE36-4756-8A48-F82283642C09' AND Name = 'NotifiedAt')) BEGIN
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
            '90e4c5db-7c38-4663-be91-03572001e08f',
            '8A42FA93-FE36-4756-8A48-F82283642C09', -- Entity: MJ: Usage Budget Events
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8A42FA93-FE36-4756-8A48-F82283642C09'),
            'NotifiedAt',
            'Notified At',
            'Timestamp when notification was sent to stakeholders for this event, or NULL if pending/skipped.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6bd2f2e9-2b2b-49e9-9aa1-a4afcbd02860' OR (EntityID = '8A42FA93-FE36-4756-8A48-F82283642C09' AND Name = '__mj_CreatedAt')) BEGIN
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
            '6bd2f2e9-2b2b-49e9-9aa1-a4afcbd02860',
            '8A42FA93-FE36-4756-8A48-F82283642C09', -- Entity: MJ: Usage Budget Events
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8A42FA93-FE36-4756-8A48-F82283642C09'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e5561872-4b52-4d7c-a9ca-2451b32afa2b' OR (EntityID = '8A42FA93-FE36-4756-8A48-F82283642C09' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'e5561872-4b52-4d7c-a9ca-2451b32afa2b',
            '8A42FA93-FE36-4756-8A48-F82283642C09', -- Entity: MJ: Usage Budget Events
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8A42FA93-FE36-4756-8A48-F82283642C09'),
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

/* SQL text to insert entity field value with ID 75fbe200-76e6-4da3-92f5-b8447a1f73ac */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('75fbe200-76e6-4da3-92f5-b8447a1f73ac', '3209054F-03E0-43E1-9605-7EA8EB142BD6', 1, 'Day', 'Day', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 07b0baa8-494e-4eaf-8228-ce2e3cf52742 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('07b0baa8-494e-4eaf-8228-ce2e3cf52742', '3209054F-03E0-43E1-9605-7EA8EB142BD6', 2, 'Month', 'Month', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 19f94247-05da-4325-a0f2-88d4fce839e3 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('19f94247-05da-4325-a0f2-88d4fce839e3', '3209054F-03E0-43E1-9605-7EA8EB142BD6', 3, 'Week', 'Week', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 3209054F-03E0-43E1-9605-7EA8EB142BD6 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='3209054F-03E0-43E1-9605-7EA8EB142BD6';

/* SQL text to insert entity field value with ID b926ca95-c91d-4aab-9ed8-120f68c7907f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b926ca95-c91d-4aab-9ed8-120f68c7907f', '0ABA3983-F41A-4FBF-9661-CBCCD1F4688A', 1, 'Block', 'Block', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 50842100-d7b1-425d-93d2-a48690d93b0b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('50842100-d7b1-425d-93d2-a48690d93b0b', '0ABA3983-F41A-4FBF-9661-CBCCD1F4688A', 2, 'Notify', 'Notify', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 7e8bba81-a526-4e11-a248-9df3b78b0f92 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7e8bba81-a526-4e11-a248-9df3b78b0f92', '0ABA3983-F41A-4FBF-9661-CBCCD1F4688A', 3, 'Throttle', 'Throttle', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 0ABA3983-F41A-4FBF-9661-CBCCD1F4688A */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='0ABA3983-F41A-4FBF-9661-CBCCD1F4688A';

/* SQL text to insert entity field value with ID 0d462dea-8635-4223-aba1-38e6a8fa04bf */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0d462dea-8635-4223-aba1-38e6a8fa04bf', 'B2B5DBAF-AC76-415F-9DCA-42C09A4531E6', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID b350d3fd-7a68-4594-b849-76ff37c45b2d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b350d3fd-7a68-4594-b849-76ff37c45b2d', 'B2B5DBAF-AC76-415F-9DCA-42C09A4531E6', 2, 'Disabled', 'Disabled', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID B2B5DBAF-AC76-415F-9DCA-42C09A4531E6 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='B2B5DBAF-AC76-415F-9DCA-42C09A4531E6';

/* SQL text to insert entity field value with ID f8c55a04-58fc-4563-9bef-b210db75e716 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f8c55a04-58fc-4563-9bef-b210db75e716', 'FD2829B9-B6CB-4540-9739-F32772945663', 1, 'Block', 'Block', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID dd425749-14cf-4b11-8aec-4350e9499e56 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('dd425749-14cf-4b11-8aec-4350e9499e56', 'FD2829B9-B6CB-4540-9739-F32772945663', 2, 'Notify', 'Notify', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID f6cfab41-2a3c-40fc-86a0-9e73adf10978 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f6cfab41-2a3c-40fc-86a0-9e73adf10978', 'FD2829B9-B6CB-4540-9739-F32772945663', 3, 'Throttle', 'Throttle', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID FD2829B9-B6CB-4540-9739-F32772945663 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='FD2829B9-B6CB-4540-9739-F32772945663';


/* Create Entity Relationship: MJ: Entities -> MJ: Usage Budgets (One To Many via ScopeEntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '8ba9d642-c63b-4732-8e7c-5a1549c27d05'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('8ba9d642-c63b-4732-8e7c-5a1549c27d05', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '47FCBE1E-6F18-4461-ACDD-856D854C2172', 'ScopeEntityID', 'One To Many', 1, 1, 79, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Queries -> MJ: Usage Budgets (One To Many via MeasureQueryID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '0c9905c4-6ed2-4077-be34-3cfaa9a3a038'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('0c9905c4-6ed2-4077-be34-3cfaa9a3a038', '1B248F34-2837-EF11-86D4-6045BDEE16E6', '47FCBE1E-6F18-4461-ACDD-856D854C2172', 'MeasureQueryID', 'One To Many', 1, 1, 10, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Usage Budgets -> MJ: Usage Budget Events (One To Many via BudgetID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '8164b95f-c293-42f1-a556-58194e46b62e'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('8164b95f-c293-42f1-a556-58194e46b62e', '47FCBE1E-6F18-4461-ACDD-856D854C2172', '8A42FA93-FE36-4756-8A48-F82283642C09', 'BudgetID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for UsageBudgetEvent */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Usage Budget Events
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key BudgetID in table UsageBudgetEvent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UsageBudgetEvent_BudgetID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UsageBudgetEvent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UsageBudgetEvent_BudgetID ON [${flyway:defaultSchema}].[UsageBudgetEvent] ([BudgetID]);

/* SQL text to update entity field related entity name field map for entity field ID 57E8A346-B2FD-46FC-AD10-747ADEB83A92 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='57E8A346-B2FD-46FC-AD10-747ADEB83A92', @RelatedEntityNameFieldMap='Budget';

/* Index for Foreign Keys for UsageBudget */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Usage Budgets
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key MeasureQueryID in table UsageBudget
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UsageBudget_MeasureQueryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UsageBudget]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UsageBudget_MeasureQueryID ON [${flyway:defaultSchema}].[UsageBudget] ([MeasureQueryID]);

-- Index for foreign key ScopeEntityID in table UsageBudget
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UsageBudget_ScopeEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UsageBudget]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UsageBudget_ScopeEntityID ON [${flyway:defaultSchema}].[UsageBudget] ([ScopeEntityID]);

/* SQL text to update entity field related entity name field map for entity field ID 099AEF92-19B9-43BE-B1B1-042900896798 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='099AEF92-19B9-43BE-B1B1-042900896798', @RelatedEntityNameFieldMap='MeasureQuery';

/* SQL text to update entity field related entity name field map for entity field ID 9C2B9F6B-CD72-465A-B782-CDD7AD1A26D9 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='9C2B9F6B-CD72-465A-B782-CDD7AD1A26D9', @RelatedEntityNameFieldMap='ScopeEntity';

/* Base View SQL for MJ: Usage Budget Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Usage Budget Events
-- Item: vwUsageBudgetEvents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Usage Budget Events
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  UsageBudgetEvent
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwUsageBudgetEvents]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwUsageBudgetEvents];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwUsageBudgetEvents]
AS
SELECT
    u.*,
    MJUsageBudget_BudgetID.[Name] AS [Budget]
FROM
    [${flyway:defaultSchema}].[UsageBudgetEvent] AS u
INNER JOIN
    [${flyway:defaultSchema}].[UsageBudget] AS MJUsageBudget_BudgetID
  ON
    [u].[BudgetID] = MJUsageBudget_BudgetID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwUsageBudgetEvents] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Usage Budget Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Usage Budget Events
-- Item: Permissions for vwUsageBudgetEvents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwUsageBudgetEvents] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Usage Budget Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Usage Budget Events
-- Item: spCreateUsageBudgetEvent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR UsageBudgetEvent
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateUsageBudgetEvent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateUsageBudgetEvent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateUsageBudgetEvent]
    @ID uniqueidentifier = NULL,
    @BudgetID uniqueidentifier,
    @PeriodStart datetimeoffset,
    @ObservedAmount decimal(19, 8),
    @ThresholdPercent int,
    @Action nvarchar(20),
    @NotifiedAt_Clear bit = 0,
    @NotifiedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[UsageBudgetEvent]
            (
                [ID],
                [BudgetID],
                [PeriodStart],
                [ObservedAmount],
                [ThresholdPercent],
                [Action],
                [NotifiedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @BudgetID,
                @PeriodStart,
                @ObservedAmount,
                @ThresholdPercent,
                @Action,
                CASE WHEN @NotifiedAt_Clear = 1 THEN NULL ELSE ISNULL(@NotifiedAt, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[UsageBudgetEvent]
            (
                [BudgetID],
                [PeriodStart],
                [ObservedAmount],
                [ThresholdPercent],
                [Action],
                [NotifiedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @BudgetID,
                @PeriodStart,
                @ObservedAmount,
                @ThresholdPercent,
                @Action,
                CASE WHEN @NotifiedAt_Clear = 1 THEN NULL ELSE ISNULL(@NotifiedAt, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwUsageBudgetEvents] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUsageBudgetEvent] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Usage Budget Events */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUsageBudgetEvent] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Usage Budget Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Usage Budget Events
-- Item: spUpdateUsageBudgetEvent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR UsageBudgetEvent
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateUsageBudgetEvent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateUsageBudgetEvent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateUsageBudgetEvent]
    @ID uniqueidentifier,
    @BudgetID uniqueidentifier = NULL,
    @PeriodStart datetimeoffset = NULL,
    @ObservedAmount decimal(19, 8) = NULL,
    @ThresholdPercent int = NULL,
    @Action nvarchar(20) = NULL,
    @NotifiedAt_Clear bit = 0,
    @NotifiedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UsageBudgetEvent]
    SET
        [BudgetID] = ISNULL(@BudgetID, [BudgetID]),
        [PeriodStart] = ISNULL(@PeriodStart, [PeriodStart]),
        [ObservedAmount] = ISNULL(@ObservedAmount, [ObservedAmount]),
        [ThresholdPercent] = ISNULL(@ThresholdPercent, [ThresholdPercent]),
        [Action] = ISNULL(@Action, [Action]),
        [NotifiedAt] = CASE WHEN @NotifiedAt_Clear = 1 THEN NULL ELSE ISNULL(@NotifiedAt, [NotifiedAt]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwUsageBudgetEvents] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwUsageBudgetEvents]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUsageBudgetEvent] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the UsageBudgetEvent table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateUsageBudgetEvent]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateUsageBudgetEvent];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateUsageBudgetEvent
ON [${flyway:defaultSchema}].[UsageBudgetEvent]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UsageBudgetEvent]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[UsageBudgetEvent] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Usage Budget Events */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUsageBudgetEvent] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Usage Budget Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Usage Budget Events
-- Item: spDeleteUsageBudgetEvent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR UsageBudgetEvent
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteUsageBudgetEvent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteUsageBudgetEvent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteUsageBudgetEvent]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[UsageBudgetEvent]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUsageBudgetEvent] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Usage Budget Events */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUsageBudgetEvent] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ: Usage Budgets */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Usage Budgets
-- Item: vwUsageBudgets
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Usage Budgets
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  UsageBudget
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwUsageBudgets]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwUsageBudgets];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwUsageBudgets]
AS
SELECT
    u.*,
    MJQuery_MeasureQueryID.[Name] AS [MeasureQuery],
    MJEntity_ScopeEntityID.[Name] AS [ScopeEntity]
FROM
    [${flyway:defaultSchema}].[UsageBudget] AS u
INNER JOIN
    [${flyway:defaultSchema}].[Query] AS MJQuery_MeasureQueryID
  ON
    [u].[MeasureQueryID] = MJQuery_MeasureQueryID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_ScopeEntityID
  ON
    [u].[ScopeEntityID] = MJEntity_ScopeEntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwUsageBudgets] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Usage Budgets */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Usage Budgets
-- Item: Permissions for vwUsageBudgets
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwUsageBudgets] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Usage Budgets */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Usage Budgets
-- Item: spCreateUsageBudget
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR UsageBudget
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateUsageBudget]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateUsageBudget];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateUsageBudget]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @MeasureQueryID uniqueidentifier,
    @MeasureParameters_Clear bit = 0,
    @MeasureParameters nvarchar(MAX) = NULL,
    @MeasureColumn nvarchar(100),
    @ScopeEntityID_Clear bit = 0,
    @ScopeEntityID uniqueidentifier = NULL,
    @ScopeRecordID_Clear bit = 0,
    @ScopeRecordID nvarchar(100) = NULL,
    @Period nvarchar(20),
    @AmountLimit decimal(19, 8),
    @Unit nvarchar(20),
    @WarnAtPercent int = NULL,
    @Action nvarchar(20),
    @Status nvarchar(20) = NULL,
    @LastEvaluatedAt_Clear bit = 0,
    @LastEvaluatedAt datetimeoffset = NULL,
    @LastObservedAmount_Clear bit = 0,
    @LastObservedAmount decimal(19, 8) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[UsageBudget]
            (
                [ID],
                [Name],
                [Description],
                [MeasureQueryID],
                [MeasureParameters],
                [MeasureColumn],
                [ScopeEntityID],
                [ScopeRecordID],
                [Period],
                [AmountLimit],
                [Unit],
                [WarnAtPercent],
                [Action],
                [Status],
                [LastEvaluatedAt],
                [LastObservedAmount]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @MeasureQueryID,
                CASE WHEN @MeasureParameters_Clear = 1 THEN NULL ELSE ISNULL(@MeasureParameters, NULL) END,
                @MeasureColumn,
                CASE WHEN @ScopeEntityID_Clear = 1 THEN NULL ELSE ISNULL(@ScopeEntityID, NULL) END,
                CASE WHEN @ScopeRecordID_Clear = 1 THEN NULL ELSE ISNULL(@ScopeRecordID, NULL) END,
                @Period,
                @AmountLimit,
                @Unit,
                ISNULL(@WarnAtPercent, 80),
                @Action,
                ISNULL(@Status, 'Active'),
                CASE WHEN @LastEvaluatedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastEvaluatedAt, NULL) END,
                CASE WHEN @LastObservedAmount_Clear = 1 THEN NULL ELSE ISNULL(@LastObservedAmount, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[UsageBudget]
            (
                [Name],
                [Description],
                [MeasureQueryID],
                [MeasureParameters],
                [MeasureColumn],
                [ScopeEntityID],
                [ScopeRecordID],
                [Period],
                [AmountLimit],
                [Unit],
                [WarnAtPercent],
                [Action],
                [Status],
                [LastEvaluatedAt],
                [LastObservedAmount]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @MeasureQueryID,
                CASE WHEN @MeasureParameters_Clear = 1 THEN NULL ELSE ISNULL(@MeasureParameters, NULL) END,
                @MeasureColumn,
                CASE WHEN @ScopeEntityID_Clear = 1 THEN NULL ELSE ISNULL(@ScopeEntityID, NULL) END,
                CASE WHEN @ScopeRecordID_Clear = 1 THEN NULL ELSE ISNULL(@ScopeRecordID, NULL) END,
                @Period,
                @AmountLimit,
                @Unit,
                ISNULL(@WarnAtPercent, 80),
                @Action,
                ISNULL(@Status, 'Active'),
                CASE WHEN @LastEvaluatedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastEvaluatedAt, NULL) END,
                CASE WHEN @LastObservedAmount_Clear = 1 THEN NULL ELSE ISNULL(@LastObservedAmount, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwUsageBudgets] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUsageBudget] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Usage Budgets */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUsageBudget] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Usage Budgets */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Usage Budgets
-- Item: spUpdateUsageBudget
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR UsageBudget
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateUsageBudget]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateUsageBudget];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateUsageBudget]
    @ID uniqueidentifier,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @MeasureQueryID uniqueidentifier = NULL,
    @MeasureParameters_Clear bit = 0,
    @MeasureParameters nvarchar(MAX) = NULL,
    @MeasureColumn nvarchar(100) = NULL,
    @ScopeEntityID_Clear bit = 0,
    @ScopeEntityID uniqueidentifier = NULL,
    @ScopeRecordID_Clear bit = 0,
    @ScopeRecordID nvarchar(100) = NULL,
    @Period nvarchar(20) = NULL,
    @AmountLimit decimal(19, 8) = NULL,
    @Unit nvarchar(20) = NULL,
    @WarnAtPercent int = NULL,
    @Action nvarchar(20) = NULL,
    @Status nvarchar(20) = NULL,
    @LastEvaluatedAt_Clear bit = 0,
    @LastEvaluatedAt datetimeoffset = NULL,
    @LastObservedAmount_Clear bit = 0,
    @LastObservedAmount decimal(19, 8) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UsageBudget]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [MeasureQueryID] = ISNULL(@MeasureQueryID, [MeasureQueryID]),
        [MeasureParameters] = CASE WHEN @MeasureParameters_Clear = 1 THEN NULL ELSE ISNULL(@MeasureParameters, [MeasureParameters]) END,
        [MeasureColumn] = ISNULL(@MeasureColumn, [MeasureColumn]),
        [ScopeEntityID] = CASE WHEN @ScopeEntityID_Clear = 1 THEN NULL ELSE ISNULL(@ScopeEntityID, [ScopeEntityID]) END,
        [ScopeRecordID] = CASE WHEN @ScopeRecordID_Clear = 1 THEN NULL ELSE ISNULL(@ScopeRecordID, [ScopeRecordID]) END,
        [Period] = ISNULL(@Period, [Period]),
        [AmountLimit] = ISNULL(@AmountLimit, [AmountLimit]),
        [Unit] = ISNULL(@Unit, [Unit]),
        [WarnAtPercent] = ISNULL(@WarnAtPercent, [WarnAtPercent]),
        [Action] = ISNULL(@Action, [Action]),
        [Status] = ISNULL(@Status, [Status]),
        [LastEvaluatedAt] = CASE WHEN @LastEvaluatedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastEvaluatedAt, [LastEvaluatedAt]) END,
        [LastObservedAmount] = CASE WHEN @LastObservedAmount_Clear = 1 THEN NULL ELSE ISNULL(@LastObservedAmount, [LastObservedAmount]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwUsageBudgets] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwUsageBudgets]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUsageBudget] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the UsageBudget table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateUsageBudget]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateUsageBudget];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateUsageBudget
ON [${flyway:defaultSchema}].[UsageBudget]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UsageBudget]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[UsageBudget] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Usage Budgets */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUsageBudget] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Usage Budgets */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Usage Budgets
-- Item: spDeleteUsageBudget
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR UsageBudget
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteUsageBudget]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteUsageBudget];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteUsageBudget]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[UsageBudget]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUsageBudget] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Usage Budgets */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUsageBudget] TO [cdp_Developer], [cdp_Integration];

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
        EXEC [${flyway:defaultSchema}].[spUpdateDataContextItem] @ID = @MJDataContextItems_QueryIDID, @DataContextID = @MJDataContextItems_QueryID_DataContextID, @Type = @MJDataContextItems_QueryID_Type, @ViewID = @MJDataContextItems_QueryID_ViewID, @QueryID_Clear = 1, @QueryID = @MJDataContextItems_QueryID_QueryID, @EntityID = @MJDataContextItems_QueryID_EntityID, @RecordID = @MJDataContextItems_QueryID_RecordID, @SQL = @MJDataContextItems_QueryID_SQL, @DataJSON = @MJDataContextItems_QueryID_DataJSON, @LastRefreshedAt = @MJDataContextItems_QueryID_LastRefreshedAt, @Description = @MJDataContextItems_QueryID_Description, @CodeName = @MJDataContextItems_QueryID_CodeName

        FETCH NEXT FROM cascade_update_MJDataContextItems_QueryID_cursor INTO @MJDataContextItems_QueryIDID, @MJDataContextItems_QueryID_DataContextID, @MJDataContextItems_QueryID_Type, @MJDataContextItems_QueryID_ViewID, @MJDataContextItems_QueryID_QueryID, @MJDataContextItems_QueryID_EntityID, @MJDataContextItems_QueryID_RecordID, @MJDataContextItems_QueryID_SQL, @MJDataContextItems_QueryID_DataJSON, @MJDataContextItems_QueryID_LastRefreshedAt, @MJDataContextItems_QueryID_Description, @MJDataContextItems_QueryID_CodeName
    END

    CLOSE cascade_update_MJDataContextItems_QueryID_cursor
    DEALLOCATE cascade_update_MJDataContextItems_QueryID_cursor
    
    -- Cascade delete from MaterializedResultQuery using cursor to call spDeleteMaterializedResultQuery
    DECLARE @MJMaterializedResultQueries_QueryIDID uniqueidentifier
    DECLARE cascade_delete_MJMaterializedResultQueries_QueryID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[MaterializedResultQuery]
        WHERE [QueryID] = @ID
    
    OPEN cascade_delete_MJMaterializedResultQueries_QueryID_cursor
    FETCH NEXT FROM cascade_delete_MJMaterializedResultQueries_QueryID_cursor INTO @MJMaterializedResultQueries_QueryIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteMaterializedResultQuery] @ID = @MJMaterializedResultQueries_QueryIDID
        
        FETCH NEXT FROM cascade_delete_MJMaterializedResultQueries_QueryID_cursor INTO @MJMaterializedResultQueries_QueryIDID
    END
    
    CLOSE cascade_delete_MJMaterializedResultQueries_QueryID_cursor
    DEALLOCATE cascade_delete_MJMaterializedResultQueries_QueryID_cursor
    
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
    
    -- Cascade delete from UsageBudget using cursor to call spDeleteUsageBudget
    DECLARE @MJUsageBudgets_MeasureQueryIDID uniqueidentifier
    DECLARE cascade_delete_MJUsageBudgets_MeasureQueryID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[UsageBudget]
        WHERE [MeasureQueryID] = @ID
    
    OPEN cascade_delete_MJUsageBudgets_MeasureQueryID_cursor
    FETCH NEXT FROM cascade_delete_MJUsageBudgets_MeasureQueryID_cursor INTO @MJUsageBudgets_MeasureQueryIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteUsageBudget] @ID = @MJUsageBudgets_MeasureQueryIDID
        
        FETCH NEXT FROM cascade_delete_MJUsageBudgets_MeasureQueryID_cursor INTO @MJUsageBudgets_MeasureQueryIDID
    END
    
    CLOSE cascade_delete_MJUsageBudgets_MeasureQueryID_cursor
    DEALLOCATE cascade_delete_MJUsageBudgets_MeasureQueryID_cursor
    

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
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteQuery] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteQuery] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteQuery] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Queries */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteQuery] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteQuery] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteQuery] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 3 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1dbf5cce-a6f0-467d-b7b5-cc8fd64ff39a' OR (EntityID = '47FCBE1E-6F18-4461-ACDD-856D854C2172' AND Name = 'MeasureQuery')) BEGIN
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
            '1dbf5cce-a6f0-467d-b7b5-cc8fd64ff39a',
            '47FCBE1E-6F18-4461-ACDD-856D854C2172', -- Entity: MJ: Usage Budgets
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '47FCBE1E-6F18-4461-ACDD-856D854C2172'),
            'MeasureQuery',
            'Measure Query',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cd7a437c-dad8-425a-9e12-d2d6e8fe0bee' OR (EntityID = '47FCBE1E-6F18-4461-ACDD-856D854C2172' AND Name = 'ScopeEntity')) BEGIN
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
            'cd7a437c-dad8-425a-9e12-d2d6e8fe0bee',
            '47FCBE1E-6F18-4461-ACDD-856D854C2172', -- Entity: MJ: Usage Budgets
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '47FCBE1E-6F18-4461-ACDD-856D854C2172'),
            'ScopeEntity',
            'Scope Entity',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd68b761a-fa75-4fed-ad28-a79efd9363ef' OR (EntityID = '8A42FA93-FE36-4756-8A48-F82283642C09' AND Name = 'Budget')) BEGIN
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
            'd68b761a-fa75-4fed-ad28-a79efd9363ef',
            '8A42FA93-FE36-4756-8A48-F82283642C09', -- Entity: MJ: Usage Budget Events
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8A42FA93-FE36-4756-8A48-F82283642C09'),
            'Budget',
            'Budget',
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
