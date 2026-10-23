-- =====================================================================================
-- Alternate Base Views (MJ Canon, Layer 1)
--
-- 1. EntityAlternateBaseView: registers additional SQL views for an entity that share
--    its base view's column contract while returning a canonical row subset (e.g.
--    Active Members, Open Orders).
-- 2. QueryEntity.AlternateBaseViewID: records which alternate base view a query reads
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
    CONSTRAINT [CK_EntityAlternateBaseView_Name] CHECK (LEN(LTRIM(RTRIM([Name]))) > 0 AND [Name] NOT LIKE N'%|%' AND [Name] NOT LIKE N'%:%'),
    CONSTRAINT [CK_EntityAlternateBaseView_CachePolicy] CHECK ([CachePolicy] IN (N'Default', N'Bypass')),
    CONSTRAINT [CK_EntityAlternateBaseView_Status] CHECK ([Status] IN (N'Active', N'Deprecated', N'Disabled'))
);
GO

-- -------------------------------------------------------------------------------------
-- 2. QueryEntity.AlternateBaseViewID
-- -------------------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[QueryEntity]
    ADD [AlternateBaseViewID] UNIQUEIDENTIFIER NULL
        CONSTRAINT [FK_QueryEntity_EntityAlternateBaseView] FOREIGN KEY
        REFERENCES [${flyway:defaultSchema}].[EntityAlternateBaseView]([ID]);
GO

-- -------------------------------------------------------------------------------------
-- 3. Extended properties (Table & Column descriptions)
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
    @value = N'Logical name of the alternate base view, unique per entity (case-insensitive). Cannot contain pipe (|) or colon (:) characters. Callers pass this name via RunViewParams.AlternateBaseView or pin it on a User View.',
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
    @value = N'When this query references an alternate base view rather than the entity''s primary BaseView, records the specific MJ: Entity Alternate Base Views row while EntityID continues to reference the owning entity.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'QueryEntity',
    @level2type = N'COLUMN', @level2name = N'AlternateBaseViewID';
GO























































-- =============================================================================
-- GENERATED BY MemberJunction CodeGen — DO NOT EDIT BY HAND
-- Contains Entity / EntityField / EntityPermission / EntityRelationship inserts,
-- regenerated base views, spCreate / spUpdate / spDelete procedures, FK indexes,
-- and permission grants for EntityAlternateBaseView and QueryEntity.AlternateBaseViewID.
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
         '38b82609-4b90-477b-801b-bc4154a8de39',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '38b82609-4b90-477b-801b-bc4154a8de39', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Entity Alternate Base Views for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('38b82609-4b90-477b-801b-bc4154a8de39' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('38b82609-4b90-477b-801b-bc4154a8de39' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Entity Alternate Base Views for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('38b82609-4b90-477b-801b-bc4154a8de39' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('38b82609-4b90-477b-801b-bc4154a8de39' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Entity Alternate Base Views for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('38b82609-4b90-477b-801b-bc4154a8de39' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('38b82609-4b90-477b-801b-bc4154a8de39' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

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

/* SQL text to insert 14 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '437e22c7-73a2-42a4-964f-50e5ee71e3f7' OR (EntityID = 'EFB0FD56-7AD5-4BFE-BE31-74628FF77265' AND Name = 'AlternateBaseViewID')) BEGIN
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
            '437e22c7-73a2-42a4-964f-50e5ee71e3f7',
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
            '38B82609-4B90-477B-801B-BC4154A8DE39',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '362d67eb-0158-48e9-89a7-3d2df8d6c86c' OR (EntityID = '38B82609-4B90-477B-801B-BC4154A8DE39' AND Name = 'ID')) BEGIN
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
            '362d67eb-0158-48e9-89a7-3d2df8d6c86c',
            '38B82609-4B90-477B-801B-BC4154A8DE39', -- Entity: MJ: Entity Alternate Base Views
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '38B82609-4B90-477B-801B-BC4154A8DE39'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '531ff067-9622-4fb4-8117-677fa6bb35fb' OR (EntityID = '38B82609-4B90-477B-801B-BC4154A8DE39' AND Name = 'EntityID')) BEGIN
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
            '531ff067-9622-4fb4-8117-677fa6bb35fb',
            '38B82609-4B90-477B-801B-BC4154A8DE39', -- Entity: MJ: Entity Alternate Base Views
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '38B82609-4B90-477B-801B-BC4154A8DE39'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4f8ee735-3e4d-49ee-a543-81e7cc5df95b' OR (EntityID = '38B82609-4B90-477B-801B-BC4154A8DE39' AND Name = 'ParentID')) BEGIN
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
            '4f8ee735-3e4d-49ee-a543-81e7cc5df95b',
            '38B82609-4B90-477B-801B-BC4154A8DE39', -- Entity: MJ: Entity Alternate Base Views
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '38B82609-4B90-477B-801B-BC4154A8DE39'),
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
            '38B82609-4B90-477B-801B-BC4154A8DE39',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c4879b44-18a3-4648-88dc-c94be3e6db99' OR (EntityID = '38B82609-4B90-477B-801B-BC4154A8DE39' AND Name = 'Name')) BEGIN
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
            'c4879b44-18a3-4648-88dc-c94be3e6db99',
            '38B82609-4B90-477B-801B-BC4154A8DE39', -- Entity: MJ: Entity Alternate Base Views
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '38B82609-4B90-477B-801B-BC4154A8DE39'),
            'Name',
            'Name',
            'Logical name of the alternate base view, unique per entity (case-insensitive). Cannot contain pipe (|) or colon (:) characters. Callers pass this name via RunViewParams.AlternateBaseView or pin it on a User View.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2a3e6d40-74ce-4b1a-8343-12d0e7d5db9e' OR (EntityID = '38B82609-4B90-477B-801B-BC4154A8DE39' AND Name = 'DisplayName')) BEGIN
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
            '2a3e6d40-74ce-4b1a-8343-12d0e7d5db9e',
            '38B82609-4B90-477B-801B-BC4154A8DE39', -- Entity: MJ: Entity Alternate Base Views
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '38B82609-4B90-477B-801B-BC4154A8DE39'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7d045dea-83b0-4a60-8cb2-7335082ce8b5' OR (EntityID = '38B82609-4B90-477B-801B-BC4154A8DE39' AND Name = 'Description')) BEGIN
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
            '7d045dea-83b0-4a60-8cb2-7335082ce8b5',
            '38B82609-4B90-477B-801B-BC4154A8DE39', -- Entity: MJ: Entity Alternate Base Views
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '38B82609-4B90-477B-801B-BC4154A8DE39'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3487a094-478c-4920-8c3d-fe0f7cdce862' OR (EntityID = '38B82609-4B90-477B-801B-BC4154A8DE39' AND Name = 'SchemaName')) BEGIN
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
            '3487a094-478c-4920-8c3d-fe0f7cdce862',
            '38B82609-4B90-477B-801B-BC4154A8DE39', -- Entity: MJ: Entity Alternate Base Views
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '38B82609-4B90-477B-801B-BC4154A8DE39'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ad8f0456-815e-46bf-87c6-945374f44168' OR (EntityID = '38B82609-4B90-477B-801B-BC4154A8DE39' AND Name = 'ViewName')) BEGIN
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
            'ad8f0456-815e-46bf-87c6-945374f44168',
            '38B82609-4B90-477B-801B-BC4154A8DE39', -- Entity: MJ: Entity Alternate Base Views
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '38B82609-4B90-477B-801B-BC4154A8DE39'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '119bb279-ff18-4cf7-a54f-2513cd2d7f27' OR (EntityID = '38B82609-4B90-477B-801B-BC4154A8DE39' AND Name = 'CachePolicy')) BEGIN
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
            '119bb279-ff18-4cf7-a54f-2513cd2d7f27',
            '38B82609-4B90-477B-801B-BC4154A8DE39', -- Entity: MJ: Entity Alternate Base Views
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '38B82609-4B90-477B-801B-BC4154A8DE39'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '51eb5d80-f53e-46e6-936b-cd12982f6143' OR (EntityID = '38B82609-4B90-477B-801B-BC4154A8DE39' AND Name = 'Status')) BEGIN
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
            '51eb5d80-f53e-46e6-936b-cd12982f6143',
            '38B82609-4B90-477B-801B-BC4154A8DE39', -- Entity: MJ: Entity Alternate Base Views
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '38B82609-4B90-477B-801B-BC4154A8DE39'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7ae4e47a-5e9f-4f4c-a150-c88eecb14969' OR (EntityID = '38B82609-4B90-477B-801B-BC4154A8DE39' AND Name = 'Sequence')) BEGIN
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
            '7ae4e47a-5e9f-4f4c-a150-c88eecb14969',
            '38B82609-4B90-477B-801B-BC4154A8DE39', -- Entity: MJ: Entity Alternate Base Views
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '38B82609-4B90-477B-801B-BC4154A8DE39'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '00986856-d0ff-48cd-9ddc-6f30c698f717' OR (EntityID = '38B82609-4B90-477B-801B-BC4154A8DE39' AND Name = '__mj_CreatedAt')) BEGIN
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
            '00986856-d0ff-48cd-9ddc-6f30c698f717',
            '38B82609-4B90-477B-801B-BC4154A8DE39', -- Entity: MJ: Entity Alternate Base Views
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '38B82609-4B90-477B-801B-BC4154A8DE39'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '68b795ed-bf33-4be6-a036-564812532211' OR (EntityID = '38B82609-4B90-477B-801B-BC4154A8DE39' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '68b795ed-bf33-4be6-a036-564812532211',
            '38B82609-4B90-477B-801B-BC4154A8DE39', -- Entity: MJ: Entity Alternate Base Views
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '38B82609-4B90-477B-801B-BC4154A8DE39'),
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

/* SQL text to insert entity field value with ID 3359365f-e44b-49ed-b617-20baefda817d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3359365f-e44b-49ed-b617-20baefda817d', '119BB279-FF18-4CF7-A54F-2513CD2D7F27', 1, 'Bypass', 'Bypass', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 8cc5408e-917b-4efe-a17e-e909361da93f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8cc5408e-917b-4efe-a17e-e909361da93f', '119BB279-FF18-4CF7-A54F-2513CD2D7F27', 2, 'Default', 'Default', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 119BB279-FF18-4CF7-A54F-2513CD2D7F27 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='119BB279-FF18-4CF7-A54F-2513CD2D7F27';

/* SQL text to insert entity field value with ID e5648c8e-1bf9-4c32-847f-1e001dc54ca1 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e5648c8e-1bf9-4c32-847f-1e001dc54ca1', '51EB5D80-F53E-46E6-936B-CD12982F6143', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID ac6230a2-ecd7-43ad-8aed-c1ddf3ac6ede */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ac6230a2-ecd7-43ad-8aed-c1ddf3ac6ede', '51EB5D80-F53E-46E6-936B-CD12982F6143', 2, 'Deprecated', 'Deprecated', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 212030d9-3d2c-46e4-8691-132efd0a0b56 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('212030d9-3d2c-46e4-8691-132efd0a0b56', '51EB5D80-F53E-46E6-936B-CD12982F6143', 3, 'Disabled', 'Disabled', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 51EB5D80-F53E-46E6-936B-CD12982F6143 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='51EB5D80-F53E-46E6-936B-CD12982F6143';


/* Create Entity Relationship: MJ: Entities -> MJ: Entity Alternate Base Views (One To Many via EntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '952dce9c-fdfa-4320-b077-6e5e5c9b35c6'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('952dce9c-fdfa-4320-b077-6e5e5c9b35c6', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '38B82609-4B90-477B-801B-BC4154A8DE39', 'EntityID', 'One To Many', 1, 1, 88, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Entity Alternate Base Views -> MJ: Query Entities (One To Many via AlternateBaseViewID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '0836f8a5-e945-4705-9923-7743b42beb92'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('0836f8a5-e945-4705-9923-7743b42beb92', '38B82609-4B90-477B-801B-BC4154A8DE39', 'EFB0FD56-7AD5-4BFE-BE31-74628FF77265', 'AlternateBaseViewID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Entity Alternate Base Views -> MJ: Entity Alternate Base Views (One To Many via ParentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '4780068f-2bf3-45c2-8a45-970fab302fb3'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('4780068f-2bf3-45c2-8a45-970fab302fb3', '38B82609-4B90-477B-801B-BC4154A8DE39', '38B82609-4B90-477B-801B-BC4154A8DE39', 'ParentID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;

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

/* SQL text to update entity field related entity name field map for entity field ID 531FF067-9622-4FB4-8117-677FA6BB35FB */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='531FF067-9622-4FB4-8117-677FA6BB35FB', @RelatedEntityNameFieldMap='Entity';

/* SQL text to update entity field related entity name field map for entity field ID 4F8EE735-3E4D-49EE-A543-81E7CC5DF95B */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='4F8EE735-3E4D-49EE-A543-81E7CC5DF95B', @RelatedEntityNameFieldMap='Parent';

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

/* SQL text to update entity field related entity name field map for entity field ID 437E22C7-73A2-42A4-964F-50E5EE71E3F7 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='437E22C7-73A2-42A4-964F-50E5EE71E3F7', @RelatedEntityNameFieldMap='AlternateBaseView';

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

/* SQL text to insert 3 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '958b20e1-32b7-4750-a48d-6409951aa3a7' OR (EntityID = 'EFB0FD56-7AD5-4BFE-BE31-74628FF77265' AND Name = 'AlternateBaseView')) BEGIN
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
            '958b20e1-32b7-4750-a48d-6409951aa3a7',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c8404b7f-5d29-4b16-82f1-10bb42b3f77c' OR (EntityID = '38B82609-4B90-477B-801B-BC4154A8DE39' AND Name = 'Entity')) BEGIN
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
            'c8404b7f-5d29-4b16-82f1-10bb42b3f77c',
            '38B82609-4B90-477B-801B-BC4154A8DE39', -- Entity: MJ: Entity Alternate Base Views
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '38B82609-4B90-477B-801B-BC4154A8DE39'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b830b4d3-a481-4011-98a7-a359b7f79b9d' OR (EntityID = '38B82609-4B90-477B-801B-BC4154A8DE39' AND Name = 'Parent')) BEGIN
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
            'b830b4d3-a481-4011-98a7-a359b7f79b9d',
            '38B82609-4B90-477B-801B-BC4154A8DE39', -- Entity: MJ: Entity Alternate Base Views
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '38B82609-4B90-477B-801B-BC4154A8DE39'),
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
               WHERE ID = '51EB5D80-F53E-46E6-936B-CD12982F6143'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '7AE4E47A-5E9F-4F4C-A150-C88EECB14969'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'C8404B7F-5D29-4B16-82F1-10BB42B3F77C'
               AND AutoUpdateDefaultInView = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 0
            WHERE ID = '38B82609-4B90-477B-801B-BC4154A8DE39'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set categories for 15 fields */

-- UPDATE Entity Field Category Info MJ: Entity Alternate Base Views.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '362D67EB-0158-48E9-89A7-3D2DF8D6C86C';

-- UPDATE Entity Field Category Info MJ: Entity Alternate Base Views.EntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'View Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity'
WHERE 
   ID = '531FF067-9622-4FB4-8117-677FA6BB35FB';

-- UPDATE Entity Field Category Info MJ: Entity Alternate Base Views.ParentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'View Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Parent'
WHERE 
   ID = '4F8EE735-3E4D-49EE-A543-81E7CC5DF95B';

-- UPDATE Entity Field Category Info MJ: Entity Alternate Base Views.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'View Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C4879B44-18A3-4648-88DC-C94BE3E6DB99';

-- UPDATE Entity Field Category Info MJ: Entity Alternate Base Views.DisplayName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'View Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '2A3E6D40-74CE-4B1A-8343-12D0E7D5DB9E';

-- UPDATE Entity Field Category Info MJ: Entity Alternate Base Views.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'View Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '7D045DEA-83B0-4A60-8CB2-7335082CE8B5';

-- UPDATE Entity Field Category Info MJ: Entity Alternate Base Views.SchemaName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Database Properties',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '3487A094-478C-4920-8C3D-FE0F7CDCE862';

-- UPDATE Entity Field Category Info MJ: Entity Alternate Base Views.ViewName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Database Properties',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'AD8F0456-815E-46BF-87C6-945374F44168';

-- UPDATE Entity Field Category Info MJ: Entity Alternate Base Views.CachePolicy 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Behavior and Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '119BB279-FF18-4CF7-A54F-2513CD2D7F27';

-- UPDATE Entity Field Category Info MJ: Entity Alternate Base Views.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Behavior and Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '51EB5D80-F53E-46E6-936B-CD12982F6143';

-- UPDATE Entity Field Category Info MJ: Entity Alternate Base Views.Sequence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Behavior and Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '7AE4E47A-5E9F-4F4C-A150-C88EECB14969';

-- UPDATE Entity Field Category Info MJ: Entity Alternate Base Views.Entity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'View Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity Text'
WHERE 
   ID = 'C8404B7F-5D29-4B16-82F1-10BB42B3F77C';

-- UPDATE Entity Field Category Info MJ: Entity Alternate Base Views.Parent 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'View Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Parent Text'
WHERE 
   ID = 'B830B4D3-A481-4011-98A7-A359B7F79B9D';

-- UPDATE Entity Field Category Info MJ: Entity Alternate Base Views.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '00986856-D0FF-48CD-9DDC-6F30C698F717';

-- UPDATE Entity Field Category Info MJ: Entity Alternate Base Views.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '68B795ED-BF33-4BE6-A036-564812532211';

/* Set entity icon to fa fa-eye */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-eye', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '38B82609-4B90-477B-801B-BC4154A8DE39';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '38B82609-4B90-477B-801B-BC4154A8DE39' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('5283f6b0-5c08-533f-b9cf-b547f6a02a14', '38B82609-4B90-477B-801B-BC4154A8DE39', 'FieldCategoryInfo', '{
  "Behavior and Status": {
    "description": "Runtime caching, status configuration, and display sequence settings",
    "icon": "fa fa-cog"
  },
  "Database Properties": {
    "description": "Physical database mapping properties including schema and view names",
    "icon": "fa fa-database"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-shield-alt"
  },
  "View Configuration": {
    "description": "Core identifying attributes, names, and relationships of the alternate base view",
    "icon": "fa fa-sliders-h"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '38B82609-4B90-477B-801B-BC4154A8DE39' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('024008df-fd40-5e90-b1a6-ccf89cf53e5b', '38B82609-4B90-477B-801B-BC4154A8DE39', 'FieldCategoryIcons', '{
  "Behavior and Status": "fa fa-cog",
  "Database Properties": "fa fa-database",
  "System Metadata": "fa fa-shield-alt",
  "View Configuration": "fa fa-sliders-h"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '38B82609-4B90-477B-801B-BC4154A8DE39';

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '958B20E1-32B7-4750-A48D-6409951AA3A7'
               AND AutoUpdateDefaultInView = 1;

/* Set categories for 2 fields */

-- UPDATE Entity Field Category Info MJ: Query Entities.AlternateBaseViewID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Identifiers',
   GeneratedFormSection = 'Category',
   DisplayName = 'Alternate Base View'
WHERE 
   ID = '437E22C7-73A2-42A4-964F-50E5EE71E3F7';

-- UPDATE Entity Field Category Info MJ: Query Entities.AlternateBaseView 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Query Mapping',
   GeneratedFormSection = 'Category',
   DisplayName = 'Alternate Base View Name'
WHERE 
   ID = '958B20E1-32B7-4750-A48D-6409951AA3A7';

