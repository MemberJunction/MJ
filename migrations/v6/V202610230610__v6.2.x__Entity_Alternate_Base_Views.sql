-- =====================================================================================
-- Alternate Base Views (MJ Canon, Layer 1)
--
-- 1. EntityAlternateBaseView: registers additional SQL views for an entity that share
--    its base view's column contract while returning a canonical row subset (e.g.
--    Active Members, Open Orders).
-- 2. EntityAlternateBaseViewPermission: optional role restrictions narrowing which
--    roles may read through a registered alternate base view.
-- 3. QueryEntity.AlternateBaseViewID: records which alternate base view a query reads
--    when a query references an alternate view, while keeping EntityID pointed at the
--    owning entity for permission and cache invalidation parity.
--
-- Conventions (migrations/CLAUDE.md & guides/SCHEMA_AND_CODE_AUTHORING_GUIDE.md):
--   - Plain DDL + sp_addextendedproperty only (no existence guards).
--   - Timestamp columns (__mj_CreatedAt / __mj_UpdatedAt) and FK indexes are omitted;
--     CodeGen generates them.
--   - PostgreSQL counterpart is deferred to the release build engineer.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. EntityAlternateBaseView
-- -------------------------------------------------------------------------------------
CREATE TABLE [${flyway:defaultSchema}].[EntityAlternateBaseView] (
    [ID]          UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_EntityAlternateBaseView_ID] DEFAULT (newsequentialid()),
    [EntityID]    UNIQUEIDENTIFIER NOT NULL,
    [ParentID]    UNIQUEIDENTIFIER NULL,
    [Name]        NVARCHAR(100)    NOT NULL,
    [DisplayName] NVARCHAR(255)    NULL,
    [Description] NVARCHAR(MAX)    NOT NULL,
    [SchemaName]  NVARCHAR(255)    NULL,
    [ViewName]    NVARCHAR(255)    NOT NULL,
    [CachePolicy] NVARCHAR(20)     NOT NULL CONSTRAINT [DF_EntityAlternateBaseView_CachePolicy] DEFAULT (N'Default'),
    [Status]      NVARCHAR(20)     NOT NULL CONSTRAINT [DF_EntityAlternateBaseView_Status] DEFAULT (N'Active'),
    [Sequence]    INT              NOT NULL CONSTRAINT [DF_EntityAlternateBaseView_Sequence] DEFAULT (0),
    CONSTRAINT [PK_EntityAlternateBaseView] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_EntityAlternateBaseView_Entity] FOREIGN KEY ([EntityID])
        REFERENCES [${flyway:defaultSchema}].[Entity]([ID]),
    CONSTRAINT [FK_EntityAlternateBaseView_Parent] FOREIGN KEY ([ParentID])
        REFERENCES [${flyway:defaultSchema}].[EntityAlternateBaseView]([ID]),
    CONSTRAINT [UQ_EntityAlternateBaseView_EntityID_Name] UNIQUE ([EntityID], [Name]),
    CONSTRAINT [CK_EntityAlternateBaseView_NoSelfParent] CHECK ([ParentID] <> [ID]),
    CONSTRAINT [CK_EntityAlternateBaseView_CachePolicy] CHECK ([CachePolicy] IN (N'Default', N'Bypass')),
    CONSTRAINT [CK_EntityAlternateBaseView_Status] CHECK ([Status] IN (N'Active', N'Deprecated', N'Disabled'))
);
GO

-- -------------------------------------------------------------------------------------
-- 2. EntityAlternateBaseViewPermission
-- -------------------------------------------------------------------------------------
CREATE TABLE [${flyway:defaultSchema}].[EntityAlternateBaseViewPermission] (
    [ID]                        UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_EntityAlternateBaseViewPermission_ID] DEFAULT (newsequentialid()),
    [EntityAlternateBaseViewID] UNIQUEIDENTIFIER NOT NULL,
    [RoleID]                    UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT [PK_EntityAlternateBaseViewPermission] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_EntityAlternateBaseViewPermission_EntityAlternateBaseView] FOREIGN KEY ([EntityAlternateBaseViewID])
        REFERENCES [${flyway:defaultSchema}].[EntityAlternateBaseView]([ID]),
    CONSTRAINT [FK_EntityAlternateBaseViewPermission_Role] FOREIGN KEY ([RoleID])
        REFERENCES [${flyway:defaultSchema}].[Role]([ID]),
    CONSTRAINT [UQ_EntityAlternateBaseViewPermission] UNIQUE ([EntityAlternateBaseViewID], [RoleID])
);
GO

-- -------------------------------------------------------------------------------------
-- 3. QueryEntity.AlternateBaseViewID
-- -------------------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[QueryEntity]
    ADD [AlternateBaseViewID] UNIQUEIDENTIFIER NULL
        CONSTRAINT [FK_QueryEntity_EntityAlternateBaseView] FOREIGN KEY
        REFERENCES [${flyway:defaultSchema}].[EntityAlternateBaseView]([ID]);
GO

-- -------------------------------------------------------------------------------------
-- 4. Extended properties (Table & Column descriptions)
-- -------------------------------------------------------------------------------------
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Registers alternate base views for an entity: SQL views that expose the same columns as the entity''s BaseView while returning a canonical row subset (such as Active Members or Open Orders).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityAlternateBaseView';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Owning entity whose column contract this alternate base view shares.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityAlternateBaseView',
    @level2type = N'COLUMN', @level2name = N'EntityID';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Optional parent alternate base view on the same entity that this view derives from (e.g. an Active Auto-Renew Members view built on top of Active Members). NULL when the view selects directly from the entity''s BaseView. Automatically populated on save via SQL AST extraction when the view''s FROM clause references another registered alternate base view.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityAlternateBaseView',
    @level2type = N'COLUMN', @level2name = N'ParentID';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Logical name of the alternate base view, unique per entity (case-insensitive). Callers pass this name via RunViewParams.AlternateBaseView or pin it on a User View.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityAlternateBaseView',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Human-friendly label shown in UI pickers and badges. Falls back to Name when NULL.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityAlternateBaseView',
    @level2type = N'COLUMN', @level2name = N'DisplayName';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Plain-language definition of which rows this alternate base view includes. Surfaced as help text in pickers and in agent and QueryGen discovery context.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityAlternateBaseView',
    @level2type = N'COLUMN', @level2name = N'Description';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Database schema of ViewName. When NULL, defaults to the owning entity''s SchemaName. Cross-schema views allow an Open App to register an alternate view in its own schema on an upstream entity.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityAlternateBaseView',
    @level2type = N'COLUMN', @level2name = N'SchemaName';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Physical SQL view name in the database. Must select all columns from the owning entity''s BaseView.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityAlternateBaseView',
    @level2type = N'COLUMN', @level2name = N'ViewName';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Controls RunView caching for this alternate view: Default caches results under an isolated abv: fingerprint segment and invalidates on entity writes; Bypass disables caching for views whose predicates depend on the clock or other tables.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityAlternateBaseView',
    @level2type = N'COLUMN', @level2name = N'CachePolicy';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Lifecycle status of the alternate view: Active (selectable and shown in pickers and agent context), Deprecated (executable with a warning, hidden from pickers and agents), or Disabled (rejected at runtime).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityAlternateBaseView',
    @level2type = N'COLUMN', @level2name = N'Status';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Display ordering of this alternate view within its owning entity (lower numbers appear first).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityAlternateBaseView',
    @level2type = N'COLUMN', @level2name = N'Sequence';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Optional role-based restrictions on an alternate base view. When an alternate view has no permission rows, any user who can read the owning entity may use it; when rows exist, only users holding at least one listed role may use it.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityAlternateBaseViewPermission';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The alternate base view being restricted.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityAlternateBaseViewPermission',
    @level2type = N'COLUMN', @level2name = N'EntityAlternateBaseViewID';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Role permitted to read through the alternate base view (provided the role can also read the owning entity).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityAlternateBaseViewPermission',
    @level2type = N'COLUMN', @level2name = N'RoleID';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'When this query references an alternate base view rather than the entity''s primary BaseView, records the specific MJ: Entity Alternate Base Views row while EntityID continues to reference the owning entity.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'QueryEntity',
    @level2type = N'COLUMN', @level2name = N'AlternateBaseViewID';
GO























































-- =============================================================================
-- GENERATED BY MemberJunction CodeGen — DO NOT EDIT BY HAND
-- Contains Entity / EntityField / EntityPermission / EntityRelationship inserts,
-- regenerated base views, spCreate / spUpdate / spDelete procedures, FK indexes,
-- and permission grants for EntityAlternateBaseView, EntityAlternateBaseViewPermission,
-- and QueryEntity.AlternateBaseViewID.
-- If the hand-written DDL above changes, re-run CodeGen and replace this section.
-- =============================================================================

/* SQL generated to create new entity MJ: Entity Alternate Base Views */

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
         [AllowCaching],
         [TrackRecordChanges],
         [AuditRecordAccess],
         [AuditViewRuns],
         [AllowAllRowsAPI],
         [AllowCreateAPI],
         [AllowUpdateAPI],
         [AllowDeleteAPI],
         [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '1d11abd5-521b-4134-a998-954335bad19a',
         'MJ: Entity Alternate Base Views',
         'Entity Alternate Base Views',
         'Registers alternate base views for an entity: SQL views that expose the same columns as the entity''s BaseView while returning a canonical row subset (such as Active Members or Open Orders).',
         NULL,
         'EntityAlternateBaseView',
         'vwEntityAlternateBaseViews',
         '${flyway:defaultSchema}',
         1,
         1,
         1,
         1,
         0,
         0,
         0,
         1,
         1,
         1,
         1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ: Entity Alternate Base Views to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '1d11abd5-521b-4134-a998-954335bad19a', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Entity Alternate Base Views for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('1d11abd5-521b-4134-a998-954335bad19a' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('1d11abd5-521b-4134-a998-954335bad19a' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Entity Alternate Base Views for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('1d11abd5-521b-4134-a998-954335bad19a' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('1d11abd5-521b-4134-a998-954335bad19a' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Entity Alternate Base Views for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('1d11abd5-521b-4134-a998-954335bad19a' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('1d11abd5-521b-4134-a998-954335bad19a' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to create new entity MJ: Entity Alternate Base View Permissions */

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
         [AllowCaching],
         [TrackRecordChanges],
         [AuditRecordAccess],
         [AuditViewRuns],
         [AllowAllRowsAPI],
         [AllowCreateAPI],
         [AllowUpdateAPI],
         [AllowDeleteAPI],
         [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '4bf37099-70a9-4947-8fb9-270d72a8feab',
         'MJ: Entity Alternate Base View Permissions',
         'Entity Alternate Base View Permissions',
         'Optional role-based restrictions on an alternate base view. When an alternate view has no permission rows, any user who can read the owning entity may use it; when rows exist, only users holding at least one listed role may use it.',
         NULL,
         'EntityAlternateBaseViewPermission',
         'vwEntityAlternateBaseViewPermissions',
         '${flyway:defaultSchema}',
         1,
         1,
         1,
         1,
         0,
         0,
         0,
         1,
         1,
         1,
         1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ: Entity Alternate Base View Permissions to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '4bf37099-70a9-4947-8fb9-270d72a8feab', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Entity Alternate Base View Permissions for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('4bf37099-70a9-4947-8fb9-270d72a8feab' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('4bf37099-70a9-4947-8fb9-270d72a8feab' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Entity Alternate Base View Permissions for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('4bf37099-70a9-4947-8fb9-270d72a8feab' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('4bf37099-70a9-4947-8fb9-270d72a8feab' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Entity Alternate Base View Permissions for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('4bf37099-70a9-4947-8fb9-270d72a8feab' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('4bf37099-70a9-4947-8fb9-270d72a8feab' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.EntityAlternateBaseViewPermission */
ALTER TABLE [${flyway:defaultSchema}].[EntityAlternateBaseViewPermission] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.EntityAlternateBaseViewPermission */
UPDATE [${flyway:defaultSchema}].[EntityAlternateBaseViewPermission] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.EntityAlternateBaseViewPermission */
ALTER TABLE [${flyway:defaultSchema}].[EntityAlternateBaseViewPermission] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.EntityAlternateBaseViewPermission */
ALTER TABLE [${flyway:defaultSchema}].[EntityAlternateBaseViewPermission] ADD CONSTRAINT [DF___mj_EntityAlternateBaseViewPermission___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.EntityAlternateBaseViewPermission */
ALTER TABLE [${flyway:defaultSchema}].[EntityAlternateBaseViewPermission] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.EntityAlternateBaseViewPermission */
UPDATE [${flyway:defaultSchema}].[EntityAlternateBaseViewPermission] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.EntityAlternateBaseViewPermission */
ALTER TABLE [${flyway:defaultSchema}].[EntityAlternateBaseViewPermission] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.EntityAlternateBaseViewPermission */
ALTER TABLE [${flyway:defaultSchema}].[EntityAlternateBaseViewPermission] ADD CONSTRAINT [DF___mj_EntityAlternateBaseViewPermission___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.EntityAlternateBaseView */
ALTER TABLE [${flyway:defaultSchema}].[EntityAlternateBaseView] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.EntityAlternateBaseView */
UPDATE [${flyway:defaultSchema}].[EntityAlternateBaseView] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.EntityAlternateBaseView */
ALTER TABLE [${flyway:defaultSchema}].[EntityAlternateBaseView] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.EntityAlternateBaseView */
ALTER TABLE [${flyway:defaultSchema}].[EntityAlternateBaseView] ADD CONSTRAINT [DF___mj_EntityAlternateBaseView___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.EntityAlternateBaseView */
ALTER TABLE [${flyway:defaultSchema}].[EntityAlternateBaseView] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.EntityAlternateBaseView */
UPDATE [${flyway:defaultSchema}].[EntityAlternateBaseView] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.EntityAlternateBaseView */
ALTER TABLE [${flyway:defaultSchema}].[EntityAlternateBaseView] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.EntityAlternateBaseView */
ALTER TABLE [${flyway:defaultSchema}].[EntityAlternateBaseView] ADD CONSTRAINT [DF___mj_EntityAlternateBaseView___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 19 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2dbc07d5-9d19-4f1e-874d-e3831ef56fc1' OR (EntityID = '4BF37099-70A9-4947-8FB9-270D72A8FEAB' AND Name = 'ID')) BEGIN
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
            '2dbc07d5-9d19-4f1e-874d-e3831ef56fc1',
            '4BF37099-70A9-4947-8FB9-270D72A8FEAB', -- Entity: MJ: Entity Alternate Base View Permissions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4BF37099-70A9-4947-8FB9-270D72A8FEAB'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fb63afd7-e207-4e68-ae54-10ea2070f18c' OR (EntityID = '4BF37099-70A9-4947-8FB9-270D72A8FEAB' AND Name = 'EntityAlternateBaseViewID')) BEGIN
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
            'fb63afd7-e207-4e68-ae54-10ea2070f18c',
            '4BF37099-70A9-4947-8FB9-270D72A8FEAB', -- Entity: MJ: Entity Alternate Base View Permissions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4BF37099-70A9-4947-8FB9-270D72A8FEAB'),
            'EntityAlternateBaseViewID',
            'Entity Alternate Base View ID',
            'The alternate base view being restricted.',
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
            '1D11ABD5-521B-4134-A998-954335BAD19A',
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
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2e4e0319-d7a2-40af-85c4-e17c301357d0' OR (EntityID = '4BF37099-70A9-4947-8FB9-270D72A8FEAB' AND Name = 'RoleID')) BEGIN
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
            '2e4e0319-d7a2-40af-85c4-e17c301357d0',
            '4BF37099-70A9-4947-8FB9-270D72A8FEAB', -- Entity: MJ: Entity Alternate Base View Permissions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4BF37099-70A9-4947-8FB9-270D72A8FEAB'),
            'RoleID',
            'Role ID',
            'Role permitted to read through the alternate base view (provided the role can also read the owning entity).',
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
            'DA238F34-2837-EF11-86D4-6045BDEE16E6',
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
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '81a5c6c5-1160-4122-8907-4ace75e47a7c' OR (EntityID = '4BF37099-70A9-4947-8FB9-270D72A8FEAB' AND Name = '__mj_CreatedAt')) BEGIN
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
            '81a5c6c5-1160-4122-8907-4ace75e47a7c',
            '4BF37099-70A9-4947-8FB9-270D72A8FEAB', -- Entity: MJ: Entity Alternate Base View Permissions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4BF37099-70A9-4947-8FB9-270D72A8FEAB'),
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bf053ab2-0687-4a23-a325-3ff4e6793cc2' OR (EntityID = '4BF37099-70A9-4947-8FB9-270D72A8FEAB' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'bf053ab2-0687-4a23-a325-3ff4e6793cc2',
            '4BF37099-70A9-4947-8FB9-270D72A8FEAB', -- Entity: MJ: Entity Alternate Base View Permissions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4BF37099-70A9-4947-8FB9-270D72A8FEAB'),
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'aabc250c-69b8-463d-bf3a-addeed5c640d' OR (EntityID = 'EFB0FD56-7AD5-4BFE-BE31-74628FF77265' AND Name = 'AlternateBaseViewID')) BEGIN
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
            'aabc250c-69b8-463d-bf3a-addeed5c640d',
            'EFB0FD56-7AD5-4BFE-BE31-74628FF77265', -- Entity: MJ: Query Entities
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'EFB0FD56-7AD5-4BFE-BE31-74628FF77265'),
            'AlternateBaseViewID',
            'Alternate Base View ID',
            'When this query references an alternate base view rather than the entity''s primary BaseView, records the specific MJ: Entity Alternate Base Views row while EntityID continues to reference the owning entity.',
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
            '1D11ABD5-521B-4134-A998-954335BAD19A',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '438cc42f-eae9-49b8-b7a2-ef7ab1ed0dff' OR (EntityID = '1D11ABD5-521B-4134-A998-954335BAD19A' AND Name = 'ID')) BEGIN
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
            '438cc42f-eae9-49b8-b7a2-ef7ab1ed0dff',
            '1D11ABD5-521B-4134-A998-954335BAD19A', -- Entity: MJ: Entity Alternate Base Views
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1D11ABD5-521B-4134-A998-954335BAD19A'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'eeb0c5af-d6c2-4211-aa50-6a9afdfbb9bb' OR (EntityID = '1D11ABD5-521B-4134-A998-954335BAD19A' AND Name = 'EntityID')) BEGIN
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
            'eeb0c5af-d6c2-4211-aa50-6a9afdfbb9bb',
            '1D11ABD5-521B-4134-A998-954335BAD19A', -- Entity: MJ: Entity Alternate Base Views
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1D11ABD5-521B-4134-A998-954335BAD19A'),
            'EntityID',
            'Entity ID',
            'Owning entity whose column contract this alternate base view shares.',
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
            'E0238F34-2837-EF11-86D4-6045BDEE16E6',
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
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3f05ee04-b5ea-4761-b4e9-0dc5293caf17' OR (EntityID = '1D11ABD5-521B-4134-A998-954335BAD19A' AND Name = 'ParentID')) BEGIN
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
            '3f05ee04-b5ea-4761-b4e9-0dc5293caf17',
            '1D11ABD5-521B-4134-A998-954335BAD19A', -- Entity: MJ: Entity Alternate Base Views
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1D11ABD5-521B-4134-A998-954335BAD19A'),
            'ParentID',
            'Parent ID',
            'Optional parent alternate base view on the same entity that this view derives from (e.g. an Active Auto-Renew Members view built on top of Active Members). NULL when the view selects directly from the entity''s BaseView. Automatically populated on save via SQL AST extraction when the view''s FROM clause references another registered alternate base view.',
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
            '1D11ABD5-521B-4134-A998-954335BAD19A',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1186abd9-3f85-4765-a6cf-cabf762078ee' OR (EntityID = '1D11ABD5-521B-4134-A998-954335BAD19A' AND Name = 'Name')) BEGIN
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
            '1186abd9-3f85-4765-a6cf-cabf762078ee',
            '1D11ABD5-521B-4134-A998-954335BAD19A', -- Entity: MJ: Entity Alternate Base Views
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1D11ABD5-521B-4134-A998-954335BAD19A'),
            'Name',
            'Name',
            'Logical name of the alternate base view, unique per entity (case-insensitive). Callers pass this name via RunViewParams.AlternateBaseView or pin it on a User View.',
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
            1,
            1,
            0,
            1,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ce952ca5-15a5-4892-ba40-6f8fcd32984e' OR (EntityID = '1D11ABD5-521B-4134-A998-954335BAD19A' AND Name = 'DisplayName')) BEGIN
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
            'ce952ca5-15a5-4892-ba40-6f8fcd32984e',
            '1D11ABD5-521B-4134-A998-954335BAD19A', -- Entity: MJ: Entity Alternate Base Views
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1D11ABD5-521B-4134-A998-954335BAD19A'),
            'DisplayName',
            'Display Name',
            'Human-friendly label shown in UI pickers and badges. Falls back to Name when NULL.',
            'nvarchar',
            510,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1bbc5833-6b0c-477d-98f4-10b98ad1a71b' OR (EntityID = '1D11ABD5-521B-4134-A998-954335BAD19A' AND Name = 'Description')) BEGIN
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
            '1bbc5833-6b0c-477d-98f4-10b98ad1a71b',
            '1D11ABD5-521B-4134-A998-954335BAD19A', -- Entity: MJ: Entity Alternate Base Views
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1D11ABD5-521B-4134-A998-954335BAD19A'),
            'Description',
            'Description',
            'Plain-language definition of which rows this alternate base view includes. Surfaced as help text in pickers and in agent and QueryGen discovery context.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0e56c5e6-3903-41ed-80bb-30e2161151ea' OR (EntityID = '1D11ABD5-521B-4134-A998-954335BAD19A' AND Name = 'SchemaName')) BEGIN
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
            '0e56c5e6-3903-41ed-80bb-30e2161151ea',
            '1D11ABD5-521B-4134-A998-954335BAD19A', -- Entity: MJ: Entity Alternate Base Views
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1D11ABD5-521B-4134-A998-954335BAD19A'),
            'SchemaName',
            'Schema Name',
            'Database schema of ViewName. When NULL, defaults to the owning entity''s SchemaName. Cross-schema views allow an Open App to register an alternate view in its own schema on an upstream entity.',
            'nvarchar',
            510,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0b074bf8-8e27-4f9f-a564-c689c05449d1' OR (EntityID = '1D11ABD5-521B-4134-A998-954335BAD19A' AND Name = 'ViewName')) BEGIN
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
            '0b074bf8-8e27-4f9f-a564-c689c05449d1',
            '1D11ABD5-521B-4134-A998-954335BAD19A', -- Entity: MJ: Entity Alternate Base Views
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1D11ABD5-521B-4134-A998-954335BAD19A'),
            'ViewName',
            'View Name',
            'Physical SQL view name in the database. Must select all columns from the owning entity''s BaseView.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '09b7337b-9d99-4acc-898d-e9b1710e8e1f' OR (EntityID = '1D11ABD5-521B-4134-A998-954335BAD19A' AND Name = 'CachePolicy')) BEGIN
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
            '09b7337b-9d99-4acc-898d-e9b1710e8e1f',
            '1D11ABD5-521B-4134-A998-954335BAD19A', -- Entity: MJ: Entity Alternate Base Views
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1D11ABD5-521B-4134-A998-954335BAD19A'),
            'CachePolicy',
            'Cache Policy',
            'Controls RunView caching for this alternate view: Default caches results under an isolated abv: fingerprint segment and invalidates on entity writes; Bypass disables caching for views whose predicates depend on the clock or other tables.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Default',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '51d419a7-2d65-4e17-baf2-098ae606e9de' OR (EntityID = '1D11ABD5-521B-4134-A998-954335BAD19A' AND Name = 'Status')) BEGIN
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
            '51d419a7-2d65-4e17-baf2-098ae606e9de',
            '1D11ABD5-521B-4134-A998-954335BAD19A', -- Entity: MJ: Entity Alternate Base Views
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1D11ABD5-521B-4134-A998-954335BAD19A'),
            'Status',
            'Status',
            'Lifecycle status of the alternate view: Active (selectable and shown in pickers and agent context), Deprecated (executable with a warning, hidden from pickers and agents), or Disabled (rejected at runtime).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '011d455d-afe8-4293-98b4-7a5345953856' OR (EntityID = '1D11ABD5-521B-4134-A998-954335BAD19A' AND Name = 'Sequence')) BEGIN
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
            '011d455d-afe8-4293-98b4-7a5345953856',
            '1D11ABD5-521B-4134-A998-954335BAD19A', -- Entity: MJ: Entity Alternate Base Views
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1D11ABD5-521B-4134-A998-954335BAD19A'),
            'Sequence',
            'Sequence',
            'Display ordering of this alternate view within its owning entity (lower numbers appear first).',
            'int',
            4,
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fbba2854-a026-4ac4-a61f-ba51be9aed44' OR (EntityID = '1D11ABD5-521B-4134-A998-954335BAD19A' AND Name = '__mj_CreatedAt')) BEGIN
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
            'fbba2854-a026-4ac4-a61f-ba51be9aed44',
            '1D11ABD5-521B-4134-A998-954335BAD19A', -- Entity: MJ: Entity Alternate Base Views
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1D11ABD5-521B-4134-A998-954335BAD19A'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b9823038-7d68-4d72-b296-2aa89f08b033' OR (EntityID = '1D11ABD5-521B-4134-A998-954335BAD19A' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'b9823038-7d68-4d72-b296-2aa89f08b033',
            '1D11ABD5-521B-4134-A998-954335BAD19A', -- Entity: MJ: Entity Alternate Base Views
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1D11ABD5-521B-4134-A998-954335BAD19A'),
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

/* SQL text to insert entity field value with ID 87aa1de3-331b-49f4-9893-7d2f26b0c373 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('87aa1de3-331b-49f4-9893-7d2f26b0c373', '09B7337B-9D99-4ACC-898D-E9B1710E8E1F', 1, 'Bypass', 'Bypass', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID bb3f5a3d-bd18-483e-8f9d-4606ab8611a4 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('bb3f5a3d-bd18-483e-8f9d-4606ab8611a4', '09B7337B-9D99-4ACC-898D-E9B1710E8E1F', 2, 'Default', 'Default', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 09B7337B-9D99-4ACC-898D-E9B1710E8E1F */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='09B7337B-9D99-4ACC-898D-E9B1710E8E1F';

/* SQL text to insert entity field value with ID 837497c0-3725-41fe-b14d-0fef84f19c32 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('837497c0-3725-41fe-b14d-0fef84f19c32', '51D419A7-2D65-4E17-BAF2-098AE606E9DE', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID aeed46af-9d0a-4cfe-8a4b-ab7029a4b63d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('aeed46af-9d0a-4cfe-8a4b-ab7029a4b63d', '51D419A7-2D65-4E17-BAF2-098AE606E9DE', 2, 'Deprecated', 'Deprecated', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID e0fa1b2d-6d42-457a-bb11-fc13e0e863f5 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e0fa1b2d-6d42-457a-bb11-fc13e0e863f5', '51D419A7-2D65-4E17-BAF2-098AE606E9DE', 3, 'Disabled', 'Disabled', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 51D419A7-2D65-4E17-BAF2-098AE606E9DE */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='51D419A7-2D65-4E17-BAF2-098AE606E9DE';

/* Deterministic search-flag hygiene — clear AllowUserSearchAPI */

         UPDATE [${flyway:defaultSchema}].[Entity]
         SET [AllowUserSearchAPI] = 0
         WHERE [ID] IN (
            SELECT e.[ID]
            FROM [${flyway:defaultSchema}].[Entity] e
            WHERE e.[AllowUserSearchAPI] = 1
              AND e.[AutoUpdateAllowUserSearchAPI] = 1
              AND e.[VirtualEntity] = 0
              AND ISNULL(e.[FullTextSearchEnabled], 0) = 0
              AND e.[SchemaName] NOT IN ('sys','staging')
              AND NOT EXISTS (
               SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] f2
               WHERE f2.[EntityID] = e.[ID]
                 AND f2.[IncludeInUserSearchAPI] = 1
            )
         );


/* Create Entity Relationship: MJ: Roles -> MJ: Entity Alternate Base View Permissions (One To Many via RoleID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'aa15acd8-2f9c-4835-8921-a4779cd82be6'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('aa15acd8-2f9c-4835-8921-a4779cd82be6', 'DA238F34-2837-EF11-86D4-6045BDEE16E6', '4BF37099-70A9-4947-8FB9-270D72A8FEAB', 'RoleID', 'One To Many', 1, 1, 19, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Entities -> MJ: Entity Alternate Base Views (One To Many via EntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'b88e6259-34f0-4551-9415-0496962fa164'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('b88e6259-34f0-4551-9415-0496962fa164', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '1D11ABD5-521B-4134-A998-954335BAD19A', 'EntityID', 'One To Many', 1, 1, 88, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Entity Alternate Base Views -> MJ: Entity Alternate Base View Permissions (One To Many via EntityAlternateBaseViewID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'bfa70903-ef7b-40b9-9ceb-3ae3213a8862'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('bfa70903-ef7b-40b9-9ceb-3ae3213a8862', '1D11ABD5-521B-4134-A998-954335BAD19A', '4BF37099-70A9-4947-8FB9-270D72A8FEAB', 'EntityAlternateBaseViewID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Entity Alternate Base Views -> MJ: Query Entities (One To Many via AlternateBaseViewID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '8bbd747d-5387-46e8-880a-76a073ea1d06'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('8bbd747d-5387-46e8-880a-76a073ea1d06', '1D11ABD5-521B-4134-A998-954335BAD19A', 'EFB0FD56-7AD5-4BFE-BE31-74628FF77265', 'AlternateBaseViewID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Entity Alternate Base Views -> MJ: Entity Alternate Base Views (One To Many via ParentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '74d6357f-b91a-4e32-a587-d9718a2fb06a'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('74d6357f-b91a-4e32-a587-d9718a2fb06a', '1D11ABD5-521B-4134-A998-954335BAD19A', '1D11ABD5-521B-4134-A998-954335BAD19A', 'ParentID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for EntityAlternateBaseViewPermission */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Alternate Base View Permissions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityAlternateBaseViewID in table EntityAlternateBaseViewPermission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityAlternateBaseViewPermission_EntityAlternateBaseViewID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityAlternateBaseViewPermission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityAlternateBaseViewPermission_EntityAlternateBaseViewID ON [${flyway:defaultSchema}].[EntityAlternateBaseViewPermission] ([EntityAlternateBaseViewID]);

-- Index for foreign key RoleID in table EntityAlternateBaseViewPermission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityAlternateBaseViewPermission_RoleID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityAlternateBaseViewPermission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityAlternateBaseViewPermission_RoleID ON [${flyway:defaultSchema}].[EntityAlternateBaseViewPermission] ([RoleID]);

/* SQL text to update entity field related entity name field map for entity field ID FB63AFD7-E207-4E68-AE54-10EA2070F18C */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='FB63AFD7-E207-4E68-AE54-10EA2070F18C', @RelatedEntityNameFieldMap='EntityAlternateBaseView';

/* Index for Foreign Keys for EntityAlternateBaseView */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Alternate Base Views
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table EntityAlternateBaseView
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityAlternateBaseView_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityAlternateBaseView]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityAlternateBaseView_EntityID ON [${flyway:defaultSchema}].[EntityAlternateBaseView] ([EntityID]);

-- Index for foreign key ParentID in table EntityAlternateBaseView
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityAlternateBaseView_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityAlternateBaseView]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityAlternateBaseView_ParentID ON [${flyway:defaultSchema}].[EntityAlternateBaseView] ([ParentID]);

/* SQL text to update entity field related entity name field map for entity field ID EEB0C5AF-D6C2-4211-AA50-6A9AFDFBB9BB */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='EEB0C5AF-D6C2-4211-AA50-6A9AFDFBB9BB', @RelatedEntityNameFieldMap='Entity';

/* SQL text to update entity field related entity name field map for entity field ID 2E4E0319-D7A2-40AF-85C4-E17C301357D0 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='2E4E0319-D7A2-40AF-85C4-E17C301357D0', @RelatedEntityNameFieldMap='Role';

/* SQL text to update entity field related entity name field map for entity field ID 3F05EE04-B5EA-4761-B4E9-0DC5293CAF17 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='3F05EE04-B5EA-4761-B4E9-0DC5293CAF17', @RelatedEntityNameFieldMap='Parent';

/* Base View SQL for MJ: Entity Alternate Base Views */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Alternate Base Views
-- Item: vwEntityAlternateBaseViews
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Entity Alternate Base Views
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  EntityAlternateBaseView
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwEntityAlternateBaseViews]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwEntityAlternateBaseViews];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwEntityAlternateBaseViews]
AS
SELECT
    e.*,
    MJEntity_EntityID.[Name] AS [Entity],
    MJEntityAlternateBaseView_ParentID.[Name] AS [Parent]
FROM
    [${flyway:defaultSchema}].[EntityAlternateBaseView] AS e
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_EntityID
  ON
    [e].[EntityID] = MJEntity_EntityID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[EntityAlternateBaseView] AS MJEntityAlternateBaseView_ParentID
  ON
    [e].[ParentID] = MJEntityAlternateBaseView_ParentID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityAlternateBaseViews] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Entity Alternate Base Views */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Alternate Base Views
-- Item: Permissions for vwEntityAlternateBaseViews
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityAlternateBaseViews] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Entity Alternate Base Views */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Alternate Base Views
-- Item: spCreateEntityAlternateBaseView
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityAlternateBaseView
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntityAlternateBaseView]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntityAlternateBaseView];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityAlternateBaseView]
    @ID uniqueidentifier = NULL,
    @EntityID uniqueidentifier,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @DisplayName_Clear bit = 0,
    @DisplayName nvarchar(255) = NULL,
    @Description nvarchar(MAX),
    @SchemaName_Clear bit = 0,
    @SchemaName nvarchar(255) = NULL,
    @ViewName nvarchar(255),
    @CachePolicy nvarchar(20) = NULL,
    @Status nvarchar(20) = NULL,
    @Sequence int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntityAlternateBaseView]
            (
                [ID],
                [EntityID],
                [ParentID],
                [Name],
                [DisplayName],
                [Description],
                [SchemaName],
                [ViewName],
                [CachePolicy],
                [Status],
                [Sequence]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityID,
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                @Name,
                CASE WHEN @DisplayName_Clear = 1 THEN NULL ELSE ISNULL(@DisplayName, NULL) END,
                @Description,
                CASE WHEN @SchemaName_Clear = 1 THEN NULL ELSE ISNULL(@SchemaName, NULL) END,
                @ViewName,
                ISNULL(@CachePolicy, 'Default'),
                ISNULL(@Status, 'Active'),
                ISNULL(@Sequence, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntityAlternateBaseView]
            (
                [EntityID],
                [ParentID],
                [Name],
                [DisplayName],
                [Description],
                [SchemaName],
                [ViewName],
                [CachePolicy],
                [Status],
                [Sequence]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityID,
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                @Name,
                CASE WHEN @DisplayName_Clear = 1 THEN NULL ELSE ISNULL(@DisplayName, NULL) END,
                @Description,
                CASE WHEN @SchemaName_Clear = 1 THEN NULL ELSE ISNULL(@SchemaName, NULL) END,
                @ViewName,
                ISNULL(@CachePolicy, 'Default'),
                ISNULL(@Status, 'Active'),
                ISNULL(@Sequence, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityAlternateBaseViews] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityAlternateBaseView] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Entity Alternate Base Views */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityAlternateBaseView] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Entity Alternate Base Views */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Alternate Base Views
-- Item: spUpdateEntityAlternateBaseView
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityAlternateBaseView
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntityAlternateBaseView]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityAlternateBaseView];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityAlternateBaseView]
    @ID uniqueidentifier,
    @EntityID uniqueidentifier = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @Name nvarchar(100) = NULL,
    @DisplayName_Clear bit = 0,
    @DisplayName nvarchar(255) = NULL,
    @Description nvarchar(MAX) = NULL,
    @SchemaName_Clear bit = 0,
    @SchemaName nvarchar(255) = NULL,
    @ViewName nvarchar(255) = NULL,
    @CachePolicy nvarchar(20) = NULL,
    @Status nvarchar(20) = NULL,
    @Sequence int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityAlternateBaseView]
    SET
        [EntityID] = ISNULL(@EntityID, [EntityID]),
        [ParentID] = CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, [ParentID]) END,
        [Name] = ISNULL(@Name, [Name]),
        [DisplayName] = CASE WHEN @DisplayName_Clear = 1 THEN NULL ELSE ISNULL(@DisplayName, [DisplayName]) END,
        [Description] = ISNULL(@Description, [Description]),
        [SchemaName] = CASE WHEN @SchemaName_Clear = 1 THEN NULL ELSE ISNULL(@SchemaName, [SchemaName]) END,
        [ViewName] = ISNULL(@ViewName, [ViewName]),
        [CachePolicy] = ISNULL(@CachePolicy, [CachePolicy]),
        [Status] = ISNULL(@Status, [Status]),
        [Sequence] = ISNULL(@Sequence, [Sequence])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntityAlternateBaseViews] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityAlternateBaseViews]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityAlternateBaseView] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityAlternateBaseView table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntityAlternateBaseView]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntityAlternateBaseView];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityAlternateBaseView
ON [${flyway:defaultSchema}].[EntityAlternateBaseView]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityAlternateBaseView]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityAlternateBaseView] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Entity Alternate Base Views */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityAlternateBaseView] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Entity Alternate Base Views */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Alternate Base Views
-- Item: spDeleteEntityAlternateBaseView
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityAlternateBaseView
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntityAlternateBaseView]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityAlternateBaseView];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityAlternateBaseView]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntityAlternateBaseView]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityAlternateBaseView] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Entity Alternate Base Views */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityAlternateBaseView] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ: Entity Alternate Base View Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Alternate Base View Permissions
-- Item: vwEntityAlternateBaseViewPermissions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Entity Alternate Base View Permissions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  EntityAlternateBaseViewPermission
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwEntityAlternateBaseViewPermissions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwEntityAlternateBaseViewPermissions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwEntityAlternateBaseViewPermissions]
AS
SELECT
    e.*,
    MJEntityAlternateBaseView_EntityAlternateBaseViewID.[Name] AS [EntityAlternateBaseView],
    MJRole_RoleID.[Name] AS [Role]
FROM
    [${flyway:defaultSchema}].[EntityAlternateBaseViewPermission] AS e
INNER JOIN
    [${flyway:defaultSchema}].[EntityAlternateBaseView] AS MJEntityAlternateBaseView_EntityAlternateBaseViewID
  ON
    [e].[EntityAlternateBaseViewID] = MJEntityAlternateBaseView_EntityAlternateBaseViewID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Role] AS MJRole_RoleID
  ON
    [e].[RoleID] = MJRole_RoleID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityAlternateBaseViewPermissions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Entity Alternate Base View Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Alternate Base View Permissions
-- Item: Permissions for vwEntityAlternateBaseViewPermissions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityAlternateBaseViewPermissions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Entity Alternate Base View Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Alternate Base View Permissions
-- Item: spCreateEntityAlternateBaseViewPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityAlternateBaseViewPermission
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntityAlternateBaseViewPermission]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntityAlternateBaseViewPermission];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityAlternateBaseViewPermission]
    @ID uniqueidentifier = NULL,
    @EntityAlternateBaseViewID uniqueidentifier,
    @RoleID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntityAlternateBaseViewPermission]
            (
                [ID],
                [EntityAlternateBaseViewID],
                [RoleID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityAlternateBaseViewID,
                @RoleID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntityAlternateBaseViewPermission]
            (
                [EntityAlternateBaseViewID],
                [RoleID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityAlternateBaseViewID,
                @RoleID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityAlternateBaseViewPermissions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityAlternateBaseViewPermission] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Entity Alternate Base View Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityAlternateBaseViewPermission] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Entity Alternate Base View Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Alternate Base View Permissions
-- Item: spUpdateEntityAlternateBaseViewPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityAlternateBaseViewPermission
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntityAlternateBaseViewPermission]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityAlternateBaseViewPermission];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityAlternateBaseViewPermission]
    @ID uniqueidentifier,
    @EntityAlternateBaseViewID uniqueidentifier = NULL,
    @RoleID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityAlternateBaseViewPermission]
    SET
        [EntityAlternateBaseViewID] = ISNULL(@EntityAlternateBaseViewID, [EntityAlternateBaseViewID]),
        [RoleID] = ISNULL(@RoleID, [RoleID])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntityAlternateBaseViewPermissions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityAlternateBaseViewPermissions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityAlternateBaseViewPermission] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityAlternateBaseViewPermission table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntityAlternateBaseViewPermission]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntityAlternateBaseViewPermission];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityAlternateBaseViewPermission
ON [${flyway:defaultSchema}].[EntityAlternateBaseViewPermission]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityAlternateBaseViewPermission]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityAlternateBaseViewPermission] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Entity Alternate Base View Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityAlternateBaseViewPermission] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Entity Alternate Base View Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Alternate Base View Permissions
-- Item: spDeleteEntityAlternateBaseViewPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityAlternateBaseViewPermission
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntityAlternateBaseViewPermission]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityAlternateBaseViewPermission];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityAlternateBaseViewPermission]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntityAlternateBaseViewPermission]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityAlternateBaseViewPermission] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Entity Alternate Base View Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityAlternateBaseViewPermission] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for QueryEntity */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query Entities
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key QueryID in table QueryEntity
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_QueryEntity_QueryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[QueryEntity]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_QueryEntity_QueryID ON [${flyway:defaultSchema}].[QueryEntity] ([QueryID]);

-- Index for foreign key EntityID in table QueryEntity
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_QueryEntity_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[QueryEntity]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_QueryEntity_EntityID ON [${flyway:defaultSchema}].[QueryEntity] ([EntityID]);

-- Index for foreign key AlternateBaseViewID in table QueryEntity
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_QueryEntity_AlternateBaseViewID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[QueryEntity]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_QueryEntity_AlternateBaseViewID ON [${flyway:defaultSchema}].[QueryEntity] ([AlternateBaseViewID]);

/* SQL text to update entity field related entity name field map for entity field ID AABC250C-69B8-463D-BF3A-ADDEED5C640D */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='AABC250C-69B8-463D-BF3A-ADDEED5C640D', @RelatedEntityNameFieldMap='AlternateBaseView';

/* Base View SQL for MJ: Query Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query Entities
-- Item: vwQueryEntities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Query Entities
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  QueryEntity
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwQueryEntities]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwQueryEntities];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwQueryEntities]
AS
SELECT
    q.*,
    MJQuery_QueryID.[Name] AS [Query],
    MJEntity_EntityID.[Name] AS [Entity],
    MJEntityAlternateBaseView_AlternateBaseViewID.[Name] AS [AlternateBaseView]
FROM
    [${flyway:defaultSchema}].[QueryEntity] AS q
INNER JOIN
    [${flyway:defaultSchema}].[Query] AS MJQuery_QueryID
  ON
    [q].[QueryID] = MJQuery_QueryID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_EntityID
  ON
    [q].[EntityID] = MJEntity_EntityID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[EntityAlternateBaseView] AS MJEntityAlternateBaseView_AlternateBaseViewID
  ON
    [q].[AlternateBaseViewID] = MJEntityAlternateBaseView_AlternateBaseViewID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwQueryEntities] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwQueryEntities] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwQueryEntities] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwQueryEntities] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Query Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query Entities
-- Item: Permissions for vwQueryEntities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwQueryEntities] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwQueryEntities] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwQueryEntities] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwQueryEntities] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Query Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query Entities
-- Item: spCreateQueryEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR QueryEntity
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateQueryEntity]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateQueryEntity];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateQueryEntity]
    @ID uniqueidentifier = NULL,
    @QueryID uniqueidentifier,
    @EntityID uniqueidentifier,
    @DetectionMethod nvarchar(50) = NULL,
    @AutoDetectConfidenceScore_Clear bit = 0,
    @AutoDetectConfidenceScore decimal(3, 2) = NULL,
    @AlternateBaseViewID_Clear bit = 0,
    @AlternateBaseViewID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[QueryEntity]
            (
                [ID],
                [QueryID],
                [EntityID],
                [DetectionMethod],
                [AutoDetectConfidenceScore],
                [AlternateBaseViewID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @QueryID,
                @EntityID,
                ISNULL(@DetectionMethod, 'Manual'),
                CASE WHEN @AutoDetectConfidenceScore_Clear = 1 THEN NULL ELSE ISNULL(@AutoDetectConfidenceScore, NULL) END,
                CASE WHEN @AlternateBaseViewID_Clear = 1 THEN NULL ELSE ISNULL(@AlternateBaseViewID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[QueryEntity]
            (
                [QueryID],
                [EntityID],
                [DetectionMethod],
                [AutoDetectConfidenceScore],
                [AlternateBaseViewID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @QueryID,
                @EntityID,
                ISNULL(@DetectionMethod, 'Manual'),
                CASE WHEN @AutoDetectConfidenceScore_Clear = 1 THEN NULL ELSE ISNULL(@AutoDetectConfidenceScore, NULL) END,
                CASE WHEN @AlternateBaseViewID_Clear = 1 THEN NULL ELSE ISNULL(@AlternateBaseViewID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwQueryEntities] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateQueryEntity] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateQueryEntity] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQueryEntity] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Query Entities */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateQueryEntity] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateQueryEntity] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQueryEntity] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Query Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query Entities
-- Item: spUpdateQueryEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR QueryEntity
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateQueryEntity]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateQueryEntity];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateQueryEntity]
    @ID uniqueidentifier,
    @QueryID uniqueidentifier = NULL,
    @EntityID uniqueidentifier = NULL,
    @DetectionMethod nvarchar(50) = NULL,
    @AutoDetectConfidenceScore_Clear bit = 0,
    @AutoDetectConfidenceScore decimal(3, 2) = NULL,
    @AlternateBaseViewID_Clear bit = 0,
    @AlternateBaseViewID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[QueryEntity]
    SET
        [QueryID] = ISNULL(@QueryID, [QueryID]),
        [EntityID] = ISNULL(@EntityID, [EntityID]),
        [DetectionMethod] = ISNULL(@DetectionMethod, [DetectionMethod]),
        [AutoDetectConfidenceScore] = CASE WHEN @AutoDetectConfidenceScore_Clear = 1 THEN NULL ELSE ISNULL(@AutoDetectConfidenceScore, [AutoDetectConfidenceScore]) END,
        [AlternateBaseViewID] = CASE WHEN @AlternateBaseViewID_Clear = 1 THEN NULL ELSE ISNULL(@AlternateBaseViewID, [AlternateBaseViewID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwQueryEntities] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwQueryEntities]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateQueryEntity] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateQueryEntity] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateQueryEntity] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the QueryEntity table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateQueryEntity]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateQueryEntity];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateQueryEntity
ON [${flyway:defaultSchema}].[QueryEntity]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[QueryEntity]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[QueryEntity] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Query Entities */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateQueryEntity] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateQueryEntity] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateQueryEntity] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Query Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query Entities
-- Item: spDeleteQueryEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR QueryEntity
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteQueryEntity]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteQueryEntity];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteQueryEntity]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[QueryEntity]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteQueryEntity] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteQueryEntity] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Query Entities */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteQueryEntity] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteQueryEntity] TO [cdp_Developer], [cdp_Integration];

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

/* SQL text to insert 5 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '77f685ba-f14a-45e9-9fd4-b9f4394ddd7b' OR (EntityID = '4BF37099-70A9-4947-8FB9-270D72A8FEAB' AND Name = 'EntityAlternateBaseView')) BEGIN
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
            '77f685ba-f14a-45e9-9fd4-b9f4394ddd7b',
            '4BF37099-70A9-4947-8FB9-270D72A8FEAB', -- Entity: MJ: Entity Alternate Base View Permissions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4BF37099-70A9-4947-8FB9-270D72A8FEAB'),
            'EntityAlternateBaseView',
            'Entity Alternate Base View',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3610891f-68eb-4bc6-a0b1-30af2205d7d1' OR (EntityID = '4BF37099-70A9-4947-8FB9-270D72A8FEAB' AND Name = 'Role')) BEGIN
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
            '3610891f-68eb-4bc6-a0b1-30af2205d7d1',
            '4BF37099-70A9-4947-8FB9-270D72A8FEAB', -- Entity: MJ: Entity Alternate Base View Permissions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4BF37099-70A9-4947-8FB9-270D72A8FEAB'),
            'Role',
            'Role',
            NULL,
            'nvarchar',
            100,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2d2a5a47-201d-41aa-909a-99534ab7363d' OR (EntityID = 'EFB0FD56-7AD5-4BFE-BE31-74628FF77265' AND Name = 'AlternateBaseView')) BEGIN
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
            '2d2a5a47-201d-41aa-909a-99534ab7363d',
            'EFB0FD56-7AD5-4BFE-BE31-74628FF77265', -- Entity: MJ: Query Entities
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'EFB0FD56-7AD5-4BFE-BE31-74628FF77265'),
            'AlternateBaseView',
            'Alternate Base View',
            NULL,
            'nvarchar',
            200,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'af448896-285e-4a0d-b869-f7c9628f2d27' OR (EntityID = '1D11ABD5-521B-4134-A998-954335BAD19A' AND Name = 'Entity')) BEGIN
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
            'af448896-285e-4a0d-b869-f7c9628f2d27',
            '1D11ABD5-521B-4134-A998-954335BAD19A', -- Entity: MJ: Entity Alternate Base Views
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1D11ABD5-521B-4134-A998-954335BAD19A'),
            'Entity',
            'Entity',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f8fdd282-5d66-4fbb-b94a-ce60d959e6cf' OR (EntityID = '1D11ABD5-521B-4134-A998-954335BAD19A' AND Name = 'Parent')) BEGIN
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
            'f8fdd282-5d66-4fbb-b94a-ce60d959e6cf',
            '1D11ABD5-521B-4134-A998-954335BAD19A', -- Entity: MJ: Entity Alternate Base Views
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1D11ABD5-521B-4134-A998-954335BAD19A'),
            'Parent',
            'Parent',
            NULL,
            'nvarchar',
            200,
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

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '77F685BA-F14A-45E9-9FD4-B9F4394DDD7B'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '3610891F-68EB-4BC6-A0B1-30AF2205D7D1'
               AND AutoUpdateDefaultInView = 1;

/* Set categories for 2 fields */

-- UPDATE Entity Field Category Info MJ: Query Entities.AlternateBaseViewID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Query Mapping',
   GeneratedFormSection = 'Category',
   DisplayName = 'Alternate Base View'
WHERE 
   ID = 'AABC250C-69B8-463D-BF3A-ADDEED5C640D';

-- UPDATE Entity Field Category Info MJ: Query Entities.AlternateBaseView 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Query Mapping',
   GeneratedFormSection = 'Category',
   DisplayName = 'Alternate Base View Name'
WHERE 
   ID = '2D2A5A47-201D-41AA-909A-99534AB7363D';

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '0B074BF8-8E27-4F9F-A564-C689C05449D1'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '51D419A7-2D65-4E17-BAF2-098AE606E9DE'
               AND AutoUpdateDefaultInView = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 0
            WHERE ID = '1D11ABD5-521B-4134-A998-954335BAD19A'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set categories for 7 fields */

-- UPDATE Entity Field Category Info MJ: Entity Alternate Base View Permissions.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '2DBC07D5-9D19-4F1E-874D-E3831EF56FC1';

-- UPDATE Entity Field Category Info MJ: Entity Alternate Base View Permissions.EntityAlternateBaseViewID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'View Permissions',
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity Alternate Base View'
WHERE 
   ID = 'FB63AFD7-E207-4E68-AE54-10EA2070F18C';

-- UPDATE Entity Field Category Info MJ: Entity Alternate Base View Permissions.RoleID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'View Permissions',
   GeneratedFormSection = 'Category',
   DisplayName = 'Role'
WHERE 
   ID = '2E4E0319-D7A2-40AF-85C4-E17C301357D0';

-- UPDATE Entity Field Category Info MJ: Entity Alternate Base View Permissions.EntityAlternateBaseView 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'View Permissions',
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity Alternate Base View Name'
WHERE 
   ID = '77F685BA-F14A-45E9-9FD4-B9F4394DDD7B';

-- UPDATE Entity Field Category Info MJ: Entity Alternate Base View Permissions.Role 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'View Permissions',
   GeneratedFormSection = 'Category',
   DisplayName = 'Role Name'
WHERE 
   ID = '3610891F-68EB-4BC6-A0B1-30AF2205D7D1';

-- UPDATE Entity Field Category Info MJ: Entity Alternate Base View Permissions.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '81A5C6C5-1160-4122-8907-4ACE75E47A7C';

-- UPDATE Entity Field Category Info MJ: Entity Alternate Base View Permissions.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'BF053AB2-0687-4A23-A325-3FF4E6793CC2';

/* Set entity icon to fa fa-shield-alt */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-shield-alt', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '4BF37099-70A9-4947-8FB9-270D72A8FEAB';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '4BF37099-70A9-4947-8FB9-270D72A8FEAB' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('bc10a976-e156-5747-a7bf-97a0d39e7c0f', '4BF37099-70A9-4947-8FB9-270D72A8FEAB', 'FieldCategoryInfo', '{
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  },
  "View Permissions": {
    "description": "Role-based permission mappings for alternate base views",
    "icon": "fa fa-lock"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '4BF37099-70A9-4947-8FB9-270D72A8FEAB' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('ec6c70df-c7c3-5e89-9b8a-6cc981146198', '4BF37099-70A9-4947-8FB9-270D72A8FEAB', 'FieldCategoryIcons', '{
  "System Metadata": "fa fa-cog",
  "View Permissions": "fa fa-lock"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: junction, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '4BF37099-70A9-4947-8FB9-270D72A8FEAB';

/* Set categories for 15 fields */

-- UPDATE Entity Field Category Info MJ: Entity Alternate Base Views.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '438CC42F-EAE9-49B8-B7A2-EF7AB1ED0DFF';

-- UPDATE Entity Field Category Info MJ: Entity Alternate Base Views.EntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Database & Mapping',
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity'
WHERE 
   ID = 'EEB0C5AF-D6C2-4211-AA50-6A9AFDFBB9BB';

-- UPDATE Entity Field Category Info MJ: Entity Alternate Base Views.ParentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Database & Mapping',
   GeneratedFormSection = 'Category',
   DisplayName = 'Parent'
WHERE 
   ID = '3F05EE04-B5EA-4761-B4E9-0DC5293CAF17';

-- UPDATE Entity Field Category Info MJ: Entity Alternate Base Views.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'View Definition',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1186ABD9-3F85-4765-A6CF-CABF762078EE';

-- UPDATE Entity Field Category Info MJ: Entity Alternate Base Views.DisplayName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'View Definition',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'CE952CA5-15A5-4892-BA40-6F8FCD32984E';

-- UPDATE Entity Field Category Info MJ: Entity Alternate Base Views.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'View Definition',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1BBC5833-6B0C-477D-98F4-10B98AD1A71B';

-- UPDATE Entity Field Category Info MJ: Entity Alternate Base Views.SchemaName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Database & Mapping',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '0E56C5E6-3903-41ED-80BB-30E2161151EA';

-- UPDATE Entity Field Category Info MJ: Entity Alternate Base Views.ViewName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Database & Mapping',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '0B074BF8-8E27-4F9F-A564-C689C05449D1';

-- UPDATE Entity Field Category Info MJ: Entity Alternate Base Views.CachePolicy 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Database & Mapping',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '09B7337B-9D99-4ACC-898D-E9B1710E8E1F';

-- UPDATE Entity Field Category Info MJ: Entity Alternate Base Views.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'View Definition',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '51D419A7-2D65-4E17-BAF2-098AE606E9DE';

-- UPDATE Entity Field Category Info MJ: Entity Alternate Base Views.Sequence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'View Definition',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '011D455D-AFE8-4293-98B4-7A5345953856';

-- UPDATE Entity Field Category Info MJ: Entity Alternate Base Views.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'FBBA2854-A026-4AC4-A61F-BA51BE9AED44';

-- UPDATE Entity Field Category Info MJ: Entity Alternate Base Views.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'B9823038-7D68-4D72-B296-2AA89F08B033';

-- UPDATE Entity Field Category Info MJ: Entity Alternate Base Views.Entity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Database & Mapping',
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity Name'
WHERE 
   ID = 'AF448896-285E-4A0D-B869-F7C9628F2D27';

-- UPDATE Entity Field Category Info MJ: Entity Alternate Base Views.Parent 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Database & Mapping',
   GeneratedFormSection = 'Category',
   DisplayName = 'Parent Name'
WHERE 
   ID = 'F8FDD282-5D66-4FBB-B94A-CE60D959E6CF';

/* Set entity icon to fa fa-database */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-database', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '1D11ABD5-521B-4134-A998-954335BAD19A';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '1D11ABD5-521B-4134-A998-954335BAD19A' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('f840a636-3402-5016-b1e4-49c7e082ef2b', '1D11ABD5-521B-4134-A998-954335BAD19A', 'FieldCategoryInfo', '{
  "Database & Mapping": {
    "description": "Physical database schema, view mappings, caching, and entity relationships",
    "icon": "fa fa-database"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  },
  "View Definition": {
    "description": "Logical naming, descriptions, UI labeling, and status settings for the alternate view",
    "icon": "fa fa-eye"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '1D11ABD5-521B-4134-A998-954335BAD19A' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('4ca9514b-c16f-5863-9137-148e6fcb436d', '1D11ABD5-521B-4134-A998-954335BAD19A', 'FieldCategoryIcons', '{
  "Database & Mapping": "fa fa-database",
  "System Metadata": "fa fa-cog",
  "View Definition": "fa fa-eye"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '1D11ABD5-521B-4134-A998-954335BAD19A';

