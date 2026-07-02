-- Migration: Create EntityFormOverride table
-- Description: Bridge table that points an Entity at a Component to serve as
--   its form at runtime, scoped to User > Role > Global with priority-based
--   resolution. Foundation for Run-Time/Interactive Forms (plan PR #2609).
--
-- Resolution semantics (implemented client-side in form-resolver.service.ts):
--   1. Find Status='Active' rows for the entity matching the caller's scope.
--   2. Order by scope tier (User > Role > Global), then Priority DESC, then
--      __mj_CreatedAt DESC. First row wins.
--   3. If no row matches, fall through to the existing @RegisterClass /
--      CodeGen-generated form path — zero behavior change for entities with
--      no override.

CREATE TABLE ${flyway:defaultSchema}.EntityFormOverride (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    EntityID UNIQUEIDENTIFIER NOT NULL,
    ComponentID UNIQUEIDENTIFIER NOT NULL,
    Name NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    Scope NVARCHAR(20) NOT NULL DEFAULT 'Global',
    UserID UNIQUEIDENTIFIER NULL,
    RoleID UNIQUEIDENTIFIER NULL,
    Priority INT NOT NULL DEFAULT 0,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Active',
    Notes NVARCHAR(MAX) NULL,
    CONSTRAINT PK_EntityFormOverride PRIMARY KEY (ID),
    CONSTRAINT FK_EntityFormOverride_Entity FOREIGN KEY (EntityID)
        REFERENCES ${flyway:defaultSchema}.Entity(ID) ON DELETE CASCADE,
    CONSTRAINT FK_EntityFormOverride_Component FOREIGN KEY (ComponentID)
        REFERENCES ${flyway:defaultSchema}.Component(ID) ON DELETE CASCADE,
    CONSTRAINT FK_EntityFormOverride_User FOREIGN KEY (UserID)
        REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT FK_EntityFormOverride_Role FOREIGN KEY (RoleID)
        REFERENCES ${flyway:defaultSchema}.Role(ID),
    CONSTRAINT CK_EntityFormOverride_Scope
        CHECK (Scope IN ('User', 'Role', 'Global')),
    CONSTRAINT CK_EntityFormOverride_Status
        CHECK (Status IN ('Active', 'Inactive', 'Pending')),
    CONSTRAINT CK_EntityFormOverride_Scope_Consistency
        CHECK (
            (Scope = 'User'   AND UserID IS NOT NULL AND RoleID IS NULL) OR
            (Scope = 'Role'   AND RoleID IS NOT NULL AND UserID IS NULL) OR
            (Scope = 'Global' AND UserID IS NULL     AND RoleID IS NULL)
        )
);

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Points an Entity at a Component to serve as its form at runtime. Scoped to User > Role > Global with priority-based resolution. When present and Active, takes precedence over the entity''s @RegisterClass-registered or CodeGen-generated Angular form.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'EntityFormOverride';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Foreign key to Entity — which entity this override is for.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'EntityFormOverride',
    @level2type=N'COLUMN', @level2name=N'EntityID';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Foreign key to Component — the component that renders the form. Must declare componentRole=''form'' and implement the FormHostProps contract.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'EntityFormOverride',
    @level2type=N'COLUMN', @level2name=N'ComponentID';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Human-readable label for this override (e.g., "CSR Customer Form", "Compact Mobile Variant").',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'EntityFormOverride',
    @level2type=N'COLUMN', @level2name=N'Name';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Optional longer description of what this override is for and when it applies.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'EntityFormOverride',
    @level2type=N'COLUMN', @level2name=N'Description';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Resolution tier: User (requires UserID), Role (requires RoleID), or Global. The resolver evaluates in that order — a User row beats a Role row beats a Global row.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'EntityFormOverride',
    @level2type=N'COLUMN', @level2name=N'Scope';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Required when Scope=''User''. The single user this override applies to.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'EntityFormOverride',
    @level2type=N'COLUMN', @level2name=N'UserID';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Required when Scope=''Role''. The role whose members see this override.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'EntityFormOverride',
    @level2type=N'COLUMN', @level2name=N'RoleID';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Higher value wins within a scope tier. Ties broken by __mj_CreatedAt DESC. No IsDefault — Priority is the only mechanism.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'EntityFormOverride',
    @level2type=N'COLUMN', @level2name=N'Priority';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Active = eligible for resolution. Inactive = ignored. Pending = AI-authored, awaiting human activation (resolver treats as Inactive).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'EntityFormOverride',
    @level2type=N'COLUMN', @level2name=N'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional free-form commentary about this override — e.g. who authored it, why it exists, what should change before it goes Global, links to related discussions. Does not affect resolution.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'EntityFormOverride',
    @level2type = N'COLUMN', @level2name = 'Notes';

































































-- Codegen output
/* SQL generated to create new entity MJ: Entity Form Overrides */

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
         'bc845dbd-7248-4290-a5ad-7884c067e3a1',
         'MJ: Entity Form Overrides',
         'Entity Form Overrides',
         'Points an Entity at a Component to serve as its form at runtime. Scoped to User > Role > Global with priority-based resolution. When present and Active, takes precedence over the entity''s @RegisterClass-registered or CodeGen-generated Angular form.',
         NULL,
         'EntityFormOverride',
         'vwEntityFormOverrides',
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

/* SQL generated to add new entity MJ: Entity Form Overrides to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'bc845dbd-7248-4290-a5ad-7884c067e3a1', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Entity Form Overrides for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('bc845dbd-7248-4290-a5ad-7884c067e3a1', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Entity Form Overrides for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('bc845dbd-7248-4290-a5ad-7884c067e3a1', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Entity Form Overrides for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('bc845dbd-7248-4290-a5ad-7884c067e3a1', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.EntityFormOverride */
ALTER TABLE [${flyway:defaultSchema}].[EntityFormOverride] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.EntityFormOverride */
UPDATE [${flyway:defaultSchema}].[EntityFormOverride] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.EntityFormOverride */
ALTER TABLE [${flyway:defaultSchema}].[EntityFormOverride] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.EntityFormOverride */
ALTER TABLE [${flyway:defaultSchema}].[EntityFormOverride] ADD CONSTRAINT [DF___mj_EntityFormOverride___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.EntityFormOverride */
ALTER TABLE [${flyway:defaultSchema}].[EntityFormOverride] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.EntityFormOverride */
UPDATE [${flyway:defaultSchema}].[EntityFormOverride] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.EntityFormOverride */
ALTER TABLE [${flyway:defaultSchema}].[EntityFormOverride] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.EntityFormOverride */
ALTER TABLE [${flyway:defaultSchema}].[EntityFormOverride] ADD CONSTRAINT [DF___mj_EntityFormOverride___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '29611c01-faaf-4f0d-b468-e1c44d887ce0' OR (EntityID = 'BC845DBD-7248-4290-A5AD-7884C067E3A1' AND Name = 'ID')) BEGIN
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
            '29611c01-faaf-4f0d-b468-e1c44d887ce0',
            'BC845DBD-7248-4290-A5AD-7884C067E3A1', -- Entity: MJ: Entity Form Overrides
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7928ab00-4ee6-409e-9450-41d857fb6650' OR (EntityID = 'BC845DBD-7248-4290-A5AD-7884C067E3A1' AND Name = 'EntityID')) BEGIN
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
            '7928ab00-4ee6-409e-9450-41d857fb6650',
            'BC845DBD-7248-4290-A5AD-7884C067E3A1', -- Entity: MJ: Entity Form Overrides
            100002,
            'EntityID',
            'Entity ID',
            'Foreign key to Entity — which entity this override is for.',
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
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '48f5b8e7-2ff3-492a-8ea8-2b8ce719fdc2' OR (EntityID = 'BC845DBD-7248-4290-A5AD-7884C067E3A1' AND Name = 'ComponentID')) BEGIN
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
            '48f5b8e7-2ff3-492a-8ea8-2b8ce719fdc2',
            'BC845DBD-7248-4290-A5AD-7884C067E3A1', -- Entity: MJ: Entity Form Overrides
            100003,
            'ComponentID',
            'Component ID',
            'Foreign key to Component — the component that renders the form. Must declare componentRole=''form'' and implement the FormHostProps contract.',
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
            '0FB98A1D-C6AE-4427-B66C-7B31E669756F',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '26d29d35-6566-4483-91b9-d4648bc6900a' OR (EntityID = 'BC845DBD-7248-4290-A5AD-7884C067E3A1' AND Name = 'Name')) BEGIN
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
            '26d29d35-6566-4483-91b9-d4648bc6900a',
            'BC845DBD-7248-4290-A5AD-7884C067E3A1', -- Entity: MJ: Entity Form Overrides
            100004,
            'Name',
            'Name',
            'Human-readable label for this override (e.g., "CSR Customer Form", "Compact Mobile Variant").',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6266a8d6-4076-4205-b7c4-b356e18a4f28' OR (EntityID = 'BC845DBD-7248-4290-A5AD-7884C067E3A1' AND Name = 'Description')) BEGIN
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
            '6266a8d6-4076-4205-b7c4-b356e18a4f28',
            'BC845DBD-7248-4290-A5AD-7884C067E3A1', -- Entity: MJ: Entity Form Overrides
            100005,
            'Description',
            'Description',
            'Optional longer description of what this override is for and when it applies.',
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e3b0726f-e3a6-4ee1-a905-89cd99561fcf' OR (EntityID = 'BC845DBD-7248-4290-A5AD-7884C067E3A1' AND Name = 'Scope')) BEGIN
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
            'e3b0726f-e3a6-4ee1-a905-89cd99561fcf',
            'BC845DBD-7248-4290-A5AD-7884C067E3A1', -- Entity: MJ: Entity Form Overrides
            100006,
            'Scope',
            'Scope',
            'Resolution tier: User (requires UserID), Role (requires RoleID), or Global. The resolver evaluates in that order — a User row beats a Role row beats a Global row.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Global',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '87c36f01-6073-4f02-9b1b-661f475ce4b9' OR (EntityID = 'BC845DBD-7248-4290-A5AD-7884C067E3A1' AND Name = 'UserID')) BEGIN
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
            '87c36f01-6073-4f02-9b1b-661f475ce4b9',
            'BC845DBD-7248-4290-A5AD-7884C067E3A1', -- Entity: MJ: Entity Form Overrides
            100007,
            'UserID',
            'User ID',
            'Required when Scope=''User''. The single user this override applies to.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1942590c-6e7a-4aa3-8a94-ac669ce52dde' OR (EntityID = 'BC845DBD-7248-4290-A5AD-7884C067E3A1' AND Name = 'RoleID')) BEGIN
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
            '1942590c-6e7a-4aa3-8a94-ac669ce52dde',
            'BC845DBD-7248-4290-A5AD-7884C067E3A1', -- Entity: MJ: Entity Form Overrides
            100008,
            'RoleID',
            'Role ID',
            'Required when Scope=''Role''. The role whose members see this override.',
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
            'DA238F34-2837-EF11-86D4-6045BDEE16E6',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '651979fa-d370-4db5-9a5a-b7e4320d8a6e' OR (EntityID = 'BC845DBD-7248-4290-A5AD-7884C067E3A1' AND Name = 'Priority')) BEGIN
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
            '651979fa-d370-4db5-9a5a-b7e4320d8a6e',
            'BC845DBD-7248-4290-A5AD-7884C067E3A1', -- Entity: MJ: Entity Form Overrides
            100009,
            'Priority',
            'Priority',
            'Higher value wins within a scope tier. Ties broken by __mj_CreatedAt DESC. No IsDefault — Priority is the only mechanism.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c802f5ac-15a3-4023-b8d1-bd810404b7b5' OR (EntityID = 'BC845DBD-7248-4290-A5AD-7884C067E3A1' AND Name = 'Status')) BEGIN
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
            'c802f5ac-15a3-4023-b8d1-bd810404b7b5',
            'BC845DBD-7248-4290-A5AD-7884C067E3A1', -- Entity: MJ: Entity Form Overrides
            100010,
            'Status',
            'Status',
            'Active = eligible for resolution. Inactive = ignored. Pending = AI-authored, awaiting human activation (resolver treats as Inactive).',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'eb691608-dcbf-4630-82ad-33a102ffa960' OR (EntityID = 'BC845DBD-7248-4290-A5AD-7884C067E3A1' AND Name = 'Notes')) BEGIN
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
            'eb691608-dcbf-4630-82ad-33a102ffa960',
            'BC845DBD-7248-4290-A5AD-7884C067E3A1', -- Entity: MJ: Entity Form Overrides
            100011,
            'Notes',
            'Notes',
            'Optional free-form commentary about this override — e.g. who authored it, why it exists, what should change before it goes Global, links to related discussions. Does not affect resolution.',
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '376b951e-67d4-47a8-bb7e-7a0195648478' OR (EntityID = 'BC845DBD-7248-4290-A5AD-7884C067E3A1' AND Name = '__mj_CreatedAt')) BEGIN
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
            '376b951e-67d4-47a8-bb7e-7a0195648478',
            'BC845DBD-7248-4290-A5AD-7884C067E3A1', -- Entity: MJ: Entity Form Overrides
            100012,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '53ec4001-4d4e-457b-ae9a-8ef9615dd994' OR (EntityID = 'BC845DBD-7248-4290-A5AD-7884C067E3A1' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '53ec4001-4d4e-457b-ae9a-8ef9615dd994',
            'BC845DBD-7248-4290-A5AD-7884C067E3A1', -- Entity: MJ: Entity Form Overrides
            100013,
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

/* SQL text to insert entity field value with ID 59802e1f-3127-4009-a664-3095d3f9b47d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('59802e1f-3127-4009-a664-3095d3f9b47d', 'E3B0726F-E3A6-4EE1-A905-89CD99561FCF', 1, 'Global', 'Global', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID d57942bc-2e9e-46d6-ae35-ddea506dfbe7 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d57942bc-2e9e-46d6-ae35-ddea506dfbe7', 'E3B0726F-E3A6-4EE1-A905-89CD99561FCF', 2, 'Role', 'Role', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 2b562a75-f5a2-4c6f-a5f6-e1badd27224e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2b562a75-f5a2-4c6f-a5f6-e1badd27224e', 'E3B0726F-E3A6-4EE1-A905-89CD99561FCF', 3, 'User', 'User', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID E3B0726F-E3A6-4EE1-A905-89CD99561FCF */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='E3B0726F-E3A6-4EE1-A905-89CD99561FCF';

/* SQL text to insert entity field value with ID c98ff9ff-09fc-4248-ba6f-ce6a5d649dc9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c98ff9ff-09fc-4248-ba6f-ce6a5d649dc9', 'C802F5AC-15A3-4023-B8D1-BD810404B7B5', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 993273ff-f87d-487f-8708-fa6f831e16b5 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('993273ff-f87d-487f-8708-fa6f831e16b5', 'C802F5AC-15A3-4023-B8D1-BD810404B7B5', 2, 'Inactive', 'Inactive', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 467ad88a-4727-4d8b-a98b-514dadf61cbe */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('467ad88a-4727-4d8b-a98b-514dadf61cbe', 'C802F5AC-15A3-4023-B8D1-BD810404B7B5', 3, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID C802F5AC-15A3-4023-B8D1-BD810404B7B5 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='C802F5AC-15A3-4023-B8D1-BD810404B7B5';


/* Create Entity Relationship: MJ: Roles -> MJ: Entity Form Overrides (One To Many via RoleID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'b9bd2659-489e-403f-85d8-632caab5fcce'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('b9bd2659-489e-403f-85d8-632caab5fcce', 'DA238F34-2837-EF11-86D4-6045BDEE16E6', 'BC845DBD-7248-4290-A5AD-7884C067E3A1', 'RoleID', 'One To Many', 1, 1, 12, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Entities -> MJ: Entity Form Overrides (One To Many via EntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'd2727ba3-611e-4d6a-84bc-9834d2d4ea77'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('d2727ba3-611e-4d6a-84bc-9834d2d4ea77', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'BC845DBD-7248-4290-A5AD-7884C067E3A1', 'EntityID', 'One To Many', 1, 1, 60, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ: Entity Form Overrides (One To Many via UserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '2679b73f-9679-42f8-9621-a25fca5bc2ae'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('2679b73f-9679-42f8-9621-a25fca5bc2ae', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'BC845DBD-7248-4290-A5AD-7884C067E3A1', 'UserID', 'One To Many', 1, 1, 98, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Components -> MJ: Entity Form Overrides (One To Many via ComponentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'b1f0701d-b774-4502-af30-12c7d9b35d06'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('b1f0701d-b774-4502-af30-12c7d9b35d06', '0FB98A1D-C6AE-4427-B66C-7B31E669756F', 'BC845DBD-7248-4290-A5AD-7884C067E3A1', 'ComponentID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for EntityFormOverride */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Form Overrides
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table EntityFormOverride
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityFormOverride_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityFormOverride]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityFormOverride_EntityID ON [${flyway:defaultSchema}].[EntityFormOverride] ([EntityID]);

-- Index for foreign key ComponentID in table EntityFormOverride
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityFormOverride_ComponentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityFormOverride]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityFormOverride_ComponentID ON [${flyway:defaultSchema}].[EntityFormOverride] ([ComponentID]);

-- Index for foreign key UserID in table EntityFormOverride
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityFormOverride_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityFormOverride]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityFormOverride_UserID ON [${flyway:defaultSchema}].[EntityFormOverride] ([UserID]);

-- Index for foreign key RoleID in table EntityFormOverride
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityFormOverride_RoleID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityFormOverride]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityFormOverride_RoleID ON [${flyway:defaultSchema}].[EntityFormOverride] ([RoleID]);

/* SQL text to update entity field related entity name field map for entity field ID 7928AB00-4EE6-409E-9450-41D857FB6650 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='7928AB00-4EE6-409E-9450-41D857FB6650', @RelatedEntityNameFieldMap='Entity';

/* SQL text to update entity field related entity name field map for entity field ID 48F5B8E7-2FF3-492A-8EA8-2B8CE719FDC2 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='48F5B8E7-2FF3-492A-8EA8-2B8CE719FDC2', @RelatedEntityNameFieldMap='Component';

/* SQL text to update entity field related entity name field map for entity field ID 87C36F01-6073-4F02-9B1B-661F475CE4B9 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='87C36F01-6073-4F02-9B1B-661F475CE4B9', @RelatedEntityNameFieldMap='User';

/* SQL text to update entity field related entity name field map for entity field ID 1942590C-6E7A-4AA3-8A94-AC669CE52DDE */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='1942590C-6E7A-4AA3-8A94-AC669CE52DDE', @RelatedEntityNameFieldMap='Role';

/* Base View SQL for MJ: Entity Form Overrides */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Form Overrides
-- Item: vwEntityFormOverrides
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Entity Form Overrides
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  EntityFormOverride
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwEntityFormOverrides]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwEntityFormOverrides];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwEntityFormOverrides]
AS
SELECT
    e.*,
    MJEntity_EntityID.[Name] AS [Entity],
    MJComponent_ComponentID.[Name] AS [Component],
    MJUser_UserID.[Name] AS [User],
    MJRole_RoleID.[Name] AS [Role]
FROM
    [${flyway:defaultSchema}].[EntityFormOverride] AS e
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_EntityID
  ON
    [e].[EntityID] = MJEntity_EntityID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Component] AS MJComponent_ComponentID
  ON
    [e].[ComponentID] = MJComponent_ComponentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [e].[UserID] = MJUser_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Role] AS MJRole_RoleID
  ON
    [e].[RoleID] = MJRole_RoleID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityFormOverrides] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Entity Form Overrides */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Form Overrides
-- Item: Permissions for vwEntityFormOverrides
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityFormOverrides] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Entity Form Overrides */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Form Overrides
-- Item: spCreateEntityFormOverride
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityFormOverride
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntityFormOverride]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntityFormOverride];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityFormOverride]
    @ID uniqueidentifier = NULL,
    @EntityID uniqueidentifier,
    @ComponentID uniqueidentifier,
    @Name nvarchar(255),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Scope nvarchar(20) = NULL,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @RoleID_Clear bit = 0,
    @RoleID uniqueidentifier = NULL,
    @Priority int = NULL,
    @Status nvarchar(20) = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntityFormOverride]
            (
                [ID],
                [EntityID],
                [ComponentID],
                [Name],
                [Description],
                [Scope],
                [UserID],
                [RoleID],
                [Priority],
                [Status],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityID,
                @ComponentID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@Scope, 'Global'),
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                CASE WHEN @RoleID_Clear = 1 THEN NULL ELSE ISNULL(@RoleID, NULL) END,
                ISNULL(@Priority, 0),
                ISNULL(@Status, 'Active'),
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntityFormOverride]
            (
                [EntityID],
                [ComponentID],
                [Name],
                [Description],
                [Scope],
                [UserID],
                [RoleID],
                [Priority],
                [Status],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityID,
                @ComponentID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@Scope, 'Global'),
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                CASE WHEN @RoleID_Clear = 1 THEN NULL ELSE ISNULL(@RoleID, NULL) END,
                ISNULL(@Priority, 0),
                ISNULL(@Status, 'Active'),
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityFormOverrides] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityFormOverride] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Entity Form Overrides */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityFormOverride] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Entity Form Overrides */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Form Overrides
-- Item: spUpdateEntityFormOverride
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityFormOverride
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntityFormOverride]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityFormOverride];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityFormOverride]
    @ID uniqueidentifier,
    @EntityID uniqueidentifier = NULL,
    @ComponentID uniqueidentifier = NULL,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Scope nvarchar(20) = NULL,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @RoleID_Clear bit = 0,
    @RoleID uniqueidentifier = NULL,
    @Priority int = NULL,
    @Status nvarchar(20) = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityFormOverride]
    SET
        [EntityID] = ISNULL(@EntityID, [EntityID]),
        [ComponentID] = ISNULL(@ComponentID, [ComponentID]),
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Scope] = ISNULL(@Scope, [Scope]),
        [UserID] = CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, [UserID]) END,
        [RoleID] = CASE WHEN @RoleID_Clear = 1 THEN NULL ELSE ISNULL(@RoleID, [RoleID]) END,
        [Priority] = ISNULL(@Priority, [Priority]),
        [Status] = ISNULL(@Status, [Status]),
        [Notes] = CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, [Notes]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntityFormOverrides] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityFormOverrides]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityFormOverride] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityFormOverride table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntityFormOverride]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntityFormOverride];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityFormOverride
ON [${flyway:defaultSchema}].[EntityFormOverride]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityFormOverride]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityFormOverride] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Entity Form Overrides */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityFormOverride] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Entity Form Overrides */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Form Overrides
-- Item: spDeleteEntityFormOverride
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityFormOverride
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntityFormOverride]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityFormOverride];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityFormOverride]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntityFormOverride]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityFormOverride] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Entity Form Overrides */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityFormOverride] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f0502c15-efc2-40b3-a57d-bb9ce2ea7996' OR (EntityID = 'BC845DBD-7248-4290-A5AD-7884C067E3A1' AND Name = 'Entity')) BEGIN
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
            'f0502c15-efc2-40b3-a57d-bb9ce2ea7996',
            'BC845DBD-7248-4290-A5AD-7884C067E3A1', -- Entity: MJ: Entity Form Overrides
            100027,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8e88ece5-6a90-4006-b706-279f93897759' OR (EntityID = 'BC845DBD-7248-4290-A5AD-7884C067E3A1' AND Name = 'Component')) BEGIN
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
            '8e88ece5-6a90-4006-b706-279f93897759',
            'BC845DBD-7248-4290-A5AD-7884C067E3A1', -- Entity: MJ: Entity Form Overrides
            100028,
            'Component',
            'Component',
            NULL,
            'nvarchar',
            1000,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd1987230-2cf0-4e94-b5a3-8272b7611671' OR (EntityID = 'BC845DBD-7248-4290-A5AD-7884C067E3A1' AND Name = 'User')) BEGIN
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
            'd1987230-2cf0-4e94-b5a3-8272b7611671',
            'BC845DBD-7248-4290-A5AD-7884C067E3A1', -- Entity: MJ: Entity Form Overrides
            100029,
            'User',
            'User',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4a174983-6830-432e-be5a-d6bf936121de' OR (EntityID = 'BC845DBD-7248-4290-A5AD-7884C067E3A1' AND Name = 'Role')) BEGIN
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
            '4a174983-6830-432e-be5a-d6bf936121de',
            'BC845DBD-7248-4290-A5AD-7884C067E3A1', -- Entity: MJ: Entity Form Overrides
            100030,
            'Role',
            'Role',
            NULL,
            'nvarchar',
            100,
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
               WHERE ID = 'E3B0726F-E3A6-4EE1-A905-89CD99561FCF'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '651979FA-D370-4DB5-9A5A-B7E4320D8A6E'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'C802F5AC-15A3-4023-B8D1-BD810404B7B5'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F0502C15-EFC2-40B3-A57D-BB9CE2EA7996'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E3B0726F-E3A6-4EE1-A905-89CD99561FCF'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'C802F5AC-15A3-4023-B8D1-BD810404B7B5'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F0502C15-EFC2-40B3-A57D-BB9CE2EA7996'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'F0502C15-EFC2-40B3-A57D-BB9CE2EA7996'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = 'E3B0726F-E3A6-4EE1-A905-89CD99561FCF'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = 'C802F5AC-15A3-4023-B8D1-BD810404B7B5'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set categories for 17 fields */

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '29611C01-FAAF-4F0D-B468-E1C44D887CE0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides.EntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Override Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7928AB00-4EE6-409E-9450-41D857FB6650' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides.ComponentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Override Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Component',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '48F5B8E7-2FF3-492A-8EA8-2B8CE719FDC2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Override Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '26D29D35-6566-4483-91B9-D4648BC6900A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Override Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6266A8D6-4076-4205-B7C4-B356E18A4F28' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides.Scope 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Resolution Rules',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E3B0726F-E3A6-4EE1-A905-89CD99561FCF' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides.UserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Resolution Rules',
   GeneratedFormSection = 'Category',
   DisplayName = 'User',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '87C36F01-6073-4F02-9B1B-661F475CE4B9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides.RoleID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Resolution Rules',
   GeneratedFormSection = 'Category',
   DisplayName = 'Role',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1942590C-6E7A-4AA3-8A94-AC669CE52DDE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides.Priority 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Resolution Rules',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '651979FA-D370-4DB5-9A5A-B7E4320D8A6E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Override Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C802F5AC-15A3-4023-B8D1-BD810404B7B5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides.Notes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Override Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EB691608-DCBF-4630-82AD-33A102FFA960' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '376B951E-67D4-47A8-BB7E-7A0195648478' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '53EC4001-4D4E-457B-AE9A-8EF9615DD994' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides.Entity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Override Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F0502C15-EFC2-40B3-A57D-BB9CE2EA7996' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides.Component 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Override Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Component Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8E88ECE5-6A90-4006-B706-279F93897759' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides.User 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Resolution Rules',
   GeneratedFormSection = 'Category',
   DisplayName = 'User Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D1987230-2CF0-4E94-B5A3-8272B7611671' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides.Role 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Resolution Rules',
   GeneratedFormSection = 'Category',
   DisplayName = 'Role Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4A174983-6830-432E-BE5A-D6BF936121DE' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-window-restore */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-window-restore', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'BC845DBD-7248-4290-A5AD-7884C067E3A1';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('0dd43638-81f5-41c2-8912-897aac5607ea', 'BC845DBD-7248-4290-A5AD-7884C067E3A1', 'FieldCategoryInfo', '{"Override Configuration":{"icon":"fa fa-cogs","description":"Core technical mapping between entities and their UI components"},"Override Details":{"icon":"fa fa-info-circle","description":"Descriptive information and status of the form override"},"Resolution Rules":{"icon":"fa fa-project-diagram","description":"Logic defining scope, priority, and audience for the override"},"System Metadata":{"icon":"fa fa-database","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('5e45936f-e3e8-4008-9426-94f7926a8c42', 'BC845DBD-7248-4290-A5AD-7884C067E3A1', 'FieldCategoryIcons', '{"Override Configuration":"fa fa-cogs","Override Details":"fa fa-info-circle","Resolution Rules":"fa fa-project-diagram","System Metadata":"fa fa-database"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'BC845DBD-7248-4290-A5AD-7884C067E3A1';

/* Generated Validation Functions for MJ: Entity Form Overrides */
-- CHECK constraint for MJ: Entity Form Overrides @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), '7B31F48E-EDA3-47B4-9602-D98B7EB1AF45', GETUTCDATE(), 'TypeScript', 'Approved', '([Scope]=''User'' AND [UserID] IS NOT NULL AND [RoleID] IS NULL OR [Scope]=''Role'' AND [RoleID] IS NOT NULL AND [UserID] IS NULL OR [Scope]=''Global'' AND [UserID] IS NULL AND [RoleID] IS NULL)', 'public ValidateScopeAndIdentifierConsistency(result: ValidationResult) {
	if (this.Scope === ''User'') {
		if (this.UserID == null || this.RoleID != null) {
			result.Errors.push(new ValidationErrorInfo(
				"UserID",
				"When the scope is set to ''User'', a User must be specified and the Role must be left empty.",
				this.UserID,
				ValidationErrorType.Failure
			));
		}
	} else if (this.Scope === ''Role'') {
		if (this.RoleID == null || this.UserID != null) {
			result.Errors.push(new ValidationErrorInfo(
				"RoleID",
				"When the scope is set to ''Role'', a Role must be specified and the User must be left empty.",
				this.RoleID,
				ValidationErrorType.Failure
			));
		}
	} else if (this.Scope === ''Global'') {
		if (this.UserID != null || this.RoleID != null) {
			result.Errors.push(new ValidationErrorInfo(
				"Scope",
				"When the scope is set to ''Global'', both the User and Role fields must be empty.",
				this.Scope,
				ValidationErrorType.Failure
			));
		}
	}
}', 'Ensures that the correct identifier is provided based on the selected scope: ''User'' requires a User ID without a Role, ''Role'' requires a Role ID without a User, and ''Global'' requires both to be empty. This prevents data inconsistency by ensuring records are correctly assigned to exactly one target type.', 'ValidateScopeAndIdentifierConsistency', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'BC845DBD-7248-4290-A5AD-7884C067E3A1');

