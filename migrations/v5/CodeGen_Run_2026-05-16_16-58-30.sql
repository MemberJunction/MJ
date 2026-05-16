/* SQL generated to create new entity MJ: Entity Form Overrides */

      INSERT INTO [__mj].[Entity] (
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
         '15c92ac0-94e9-49cb-8571-f25d4d49b275',
         'MJ: Entity Form Overrides',
         'Entity Form Overrides',
         'Points an Entity at a Component to serve as its form at runtime. Scoped to User > Role > Global with priority-based resolution. When present and Active, takes precedence over the entity''s @RegisterClass-registered or CodeGen-generated Angular form.',
         NULL,
         'EntityFormOverride',
         'vwEntityFormOverrides',
         '__mj',
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
INSERT INTO [__mj].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '15c92ac0-94e9-49cb-8571-f25d4d49b275', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [__mj].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Entity Form Overrides for role UI */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('15c92ac0-94e9-49cb-8571-f25d4d49b275', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Entity Form Overrides for role Developer */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('15c92ac0-94e9-49cb-8571-f25d4d49b275', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Entity Form Overrides for role Integration */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('15c92ac0-94e9-49cb-8571-f25d4d49b275', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to add special date field __mj_CreatedAt to entity __mj.EntityFormOverride */
ALTER TABLE [__mj].[EntityFormOverride] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity __mj.EntityFormOverride */
UPDATE [__mj].[EntityFormOverride] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity __mj.EntityFormOverride */
ALTER TABLE [__mj].[EntityFormOverride] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity __mj.EntityFormOverride */
ALTER TABLE [__mj].[EntityFormOverride] ADD CONSTRAINT [DF___mj_EntityFormOverride___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.EntityFormOverride */
ALTER TABLE [__mj].[EntityFormOverride] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.EntityFormOverride */
UPDATE [__mj].[EntityFormOverride] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.EntityFormOverride */
ALTER TABLE [__mj].[EntityFormOverride] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.EntityFormOverride */
ALTER TABLE [__mj].[EntityFormOverride] ADD CONSTRAINT [DF___mj_EntityFormOverride___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [__mj].[EntityField] WHERE ID = '5ffac995-59a7-4097-a116-ad802dccd894' OR (EntityID = '15C92AC0-94E9-49CB-8571-F25D4D49B275' AND Name = 'ID')) BEGIN
         INSERT INTO [__mj].[EntityField]
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
            '5ffac995-59a7-4097-a116-ad802dccd894',
            '15C92AC0-94E9-49CB-8571-F25D4D49B275', -- Entity: MJ: Entity Form Overrides
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

      IF NOT EXISTS (SELECT 1 FROM [__mj].[EntityField] WHERE ID = '8158ecd2-0b85-44e3-a381-da556674309e' OR (EntityID = '15C92AC0-94E9-49CB-8571-F25D4D49B275' AND Name = 'EntityID')) BEGIN
         INSERT INTO [__mj].[EntityField]
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
            '8158ecd2-0b85-44e3-a381-da556674309e',
            '15C92AC0-94E9-49CB-8571-F25D4D49B275', -- Entity: MJ: Entity Form Overrides
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

      IF NOT EXISTS (SELECT 1 FROM [__mj].[EntityField] WHERE ID = '78458551-7631-4faf-9fdc-0d06765a1e6b' OR (EntityID = '15C92AC0-94E9-49CB-8571-F25D4D49B275' AND Name = 'ComponentID')) BEGIN
         INSERT INTO [__mj].[EntityField]
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
            '78458551-7631-4faf-9fdc-0d06765a1e6b',
            '15C92AC0-94E9-49CB-8571-F25D4D49B275', -- Entity: MJ: Entity Form Overrides
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

      IF NOT EXISTS (SELECT 1 FROM [__mj].[EntityField] WHERE ID = '673a88ca-dafe-49d5-9332-734f486bbcc6' OR (EntityID = '15C92AC0-94E9-49CB-8571-F25D4D49B275' AND Name = 'Name')) BEGIN
         INSERT INTO [__mj].[EntityField]
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
            '673a88ca-dafe-49d5-9332-734f486bbcc6',
            '15C92AC0-94E9-49CB-8571-F25D4D49B275', -- Entity: MJ: Entity Form Overrides
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

      IF NOT EXISTS (SELECT 1 FROM [__mj].[EntityField] WHERE ID = '750f62b7-2206-4f62-823a-7012cdfdd8e0' OR (EntityID = '15C92AC0-94E9-49CB-8571-F25D4D49B275' AND Name = 'Description')) BEGIN
         INSERT INTO [__mj].[EntityField]
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
            '750f62b7-2206-4f62-823a-7012cdfdd8e0',
            '15C92AC0-94E9-49CB-8571-F25D4D49B275', -- Entity: MJ: Entity Form Overrides
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

      IF NOT EXISTS (SELECT 1 FROM [__mj].[EntityField] WHERE ID = '22b48e33-905e-4b07-a911-1a7c8771c92c' OR (EntityID = '15C92AC0-94E9-49CB-8571-F25D4D49B275' AND Name = 'Scope')) BEGIN
         INSERT INTO [__mj].[EntityField]
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
            '22b48e33-905e-4b07-a911-1a7c8771c92c',
            '15C92AC0-94E9-49CB-8571-F25D4D49B275', -- Entity: MJ: Entity Form Overrides
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

      IF NOT EXISTS (SELECT 1 FROM [__mj].[EntityField] WHERE ID = 'aba778c6-cd79-44ed-95b8-d91a83e6384f' OR (EntityID = '15C92AC0-94E9-49CB-8571-F25D4D49B275' AND Name = 'UserID')) BEGIN
         INSERT INTO [__mj].[EntityField]
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
            'aba778c6-cd79-44ed-95b8-d91a83e6384f',
            '15C92AC0-94E9-49CB-8571-F25D4D49B275', -- Entity: MJ: Entity Form Overrides
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

      IF NOT EXISTS (SELECT 1 FROM [__mj].[EntityField] WHERE ID = '1cc7e547-cef7-420e-88ac-2222bf7298a2' OR (EntityID = '15C92AC0-94E9-49CB-8571-F25D4D49B275' AND Name = 'RoleID')) BEGIN
         INSERT INTO [__mj].[EntityField]
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
            '1cc7e547-cef7-420e-88ac-2222bf7298a2',
            '15C92AC0-94E9-49CB-8571-F25D4D49B275', -- Entity: MJ: Entity Form Overrides
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

      IF NOT EXISTS (SELECT 1 FROM [__mj].[EntityField] WHERE ID = 'd36af1f4-e233-4089-8d7c-a097862ba85b' OR (EntityID = '15C92AC0-94E9-49CB-8571-F25D4D49B275' AND Name = 'Priority')) BEGIN
         INSERT INTO [__mj].[EntityField]
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
            'd36af1f4-e233-4089-8d7c-a097862ba85b',
            '15C92AC0-94E9-49CB-8571-F25D4D49B275', -- Entity: MJ: Entity Form Overrides
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

      IF NOT EXISTS (SELECT 1 FROM [__mj].[EntityField] WHERE ID = 'ce4df7b3-5827-4f57-92cf-2529b7ed2519' OR (EntityID = '15C92AC0-94E9-49CB-8571-F25D4D49B275' AND Name = 'Status')) BEGIN
         INSERT INTO [__mj].[EntityField]
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
            'ce4df7b3-5827-4f57-92cf-2529b7ed2519',
            '15C92AC0-94E9-49CB-8571-F25D4D49B275', -- Entity: MJ: Entity Form Overrides
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

      IF NOT EXISTS (SELECT 1 FROM [__mj].[EntityField] WHERE ID = 'dd06f49c-d1cd-4d7c-99ab-d7ed3d2422a3' OR (EntityID = '15C92AC0-94E9-49CB-8571-F25D4D49B275' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [__mj].[EntityField]
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
            'dd06f49c-d1cd-4d7c-99ab-d7ed3d2422a3',
            '15C92AC0-94E9-49CB-8571-F25D4D49B275', -- Entity: MJ: Entity Form Overrides
            100011,
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

      IF NOT EXISTS (SELECT 1 FROM [__mj].[EntityField] WHERE ID = 'f8f29caa-5ded-4a83-80fb-aa8e11b41734' OR (EntityID = '15C92AC0-94E9-49CB-8571-F25D4D49B275' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [__mj].[EntityField]
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
            'f8f29caa-5ded-4a83-80fb-aa8e11b41734',
            '15C92AC0-94E9-49CB-8571-F25D4D49B275', -- Entity: MJ: Entity Form Overrides
            100012,
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

/* SQL text to insert entity field value with ID a353741d-ccd1-4091-87c1-60e98a84deba */
INSERT INTO [__mj].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a353741d-ccd1-4091-87c1-60e98a84deba', '22B48E33-905E-4B07-A911-1A7C8771C92C', 1, 'Global', 'Global', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID bcfefa36-cc58-4350-9223-9cfcdea62ec7 */
INSERT INTO [__mj].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('bcfefa36-cc58-4350-9223-9cfcdea62ec7', '22B48E33-905E-4B07-A911-1A7C8771C92C', 2, 'Role', 'Role', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 2445d497-aa70-467f-8078-c21d82e2de72 */
INSERT INTO [__mj].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2445d497-aa70-467f-8078-c21d82e2de72', '22B48E33-905E-4B07-A911-1A7C8771C92C', 3, 'User', 'User', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 22B48E33-905E-4B07-A911-1A7C8771C92C */
UPDATE [__mj].[EntityField] SET ValueListType='List' WHERE ID='22B48E33-905E-4B07-A911-1A7C8771C92C';

/* SQL text to insert entity field value with ID 72c362da-f387-4885-ab58-c50c964c6a44 */
INSERT INTO [__mj].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('72c362da-f387-4885-ab58-c50c964c6a44', 'CE4DF7B3-5827-4F57-92CF-2529B7ED2519', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID de9dbf12-ca67-476d-9d3e-a44dcb645c59 */
INSERT INTO [__mj].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('de9dbf12-ca67-476d-9d3e-a44dcb645c59', 'CE4DF7B3-5827-4F57-92CF-2529B7ED2519', 2, 'Inactive', 'Inactive', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 5ba431f3-4322-4faa-bd0d-ef7c78cb023d */
INSERT INTO [__mj].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5ba431f3-4322-4faa-bd0d-ef7c78cb023d', 'CE4DF7B3-5827-4F57-92CF-2529B7ED2519', 3, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID CE4DF7B3-5827-4F57-92CF-2529B7ED2519 */
UPDATE [__mj].[EntityField] SET ValueListType='List' WHERE ID='CE4DF7B3-5827-4F57-92CF-2529B7ED2519';


/* Create Entity Relationship: MJ: Roles -> MJ: Entity Form Overrides (One To Many via RoleID) */
   IF NOT EXISTS (
      SELECT 1 FROM [__mj].[EntityRelationship] WHERE [ID] = '3872d672-18bf-4c6d-a06e-35cfa6386ff6'
   )
   BEGIN
      INSERT INTO [__mj].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('3872d672-18bf-4c6d-a06e-35cfa6386ff6', 'DA238F34-2837-EF11-86D4-6045BDEE16E6', '15C92AC0-94E9-49CB-8571-F25D4D49B275', 'RoleID', 'One To Many', 1, 1, 12, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Entities -> MJ: Entity Form Overrides (One To Many via EntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [__mj].[EntityRelationship] WHERE [ID] = '58b5b6a5-0e70-471b-9864-b911d5e0ce26'
   )
   BEGIN
      INSERT INTO [__mj].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('58b5b6a5-0e70-471b-9864-b911d5e0ce26', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '15C92AC0-94E9-49CB-8571-F25D4D49B275', 'EntityID', 'One To Many', 1, 1, 60, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Users -> MJ: Entity Form Overrides (One To Many via UserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [__mj].[EntityRelationship] WHERE [ID] = 'e43ca743-67ef-42bb-bbb3-0eb2b4f04f06'
   )
   BEGIN
      INSERT INTO [__mj].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('e43ca743-67ef-42bb-bbb3-0eb2b4f04f06', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '15C92AC0-94E9-49CB-8571-F25D4D49B275', 'UserID', 'One To Many', 1, 1, 97, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Components -> MJ: Entity Form Overrides (One To Many via ComponentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [__mj].[EntityRelationship] WHERE [ID] = '4bf74972-cc01-4a98-8285-b3ca26fc73d2'
   )
   BEGIN
      INSERT INTO [__mj].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('4bf74972-cc01-4a98-8285-b3ca26fc73d2', '0FB98A1D-C6AE-4427-B66C-7B31E669756F', '15C92AC0-94E9-49CB-8571-F25D4D49B275', 'ComponentID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
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
    AND object_id = OBJECT_ID('[__mj].[EntityFormOverride]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityFormOverride_EntityID ON [__mj].[EntityFormOverride] ([EntityID]);

-- Index for foreign key ComponentID in table EntityFormOverride
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityFormOverride_ComponentID' 
    AND object_id = OBJECT_ID('[__mj].[EntityFormOverride]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityFormOverride_ComponentID ON [__mj].[EntityFormOverride] ([ComponentID]);

-- Index for foreign key UserID in table EntityFormOverride
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityFormOverride_UserID' 
    AND object_id = OBJECT_ID('[__mj].[EntityFormOverride]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityFormOverride_UserID ON [__mj].[EntityFormOverride] ([UserID]);

-- Index for foreign key RoleID in table EntityFormOverride
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityFormOverride_RoleID' 
    AND object_id = OBJECT_ID('[__mj].[EntityFormOverride]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityFormOverride_RoleID ON [__mj].[EntityFormOverride] ([RoleID]);

/* SQL text to update entity field related entity name field map for entity field ID 8158ECD2-0B85-44E3-A381-DA556674309E */
EXEC [__mj].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='8158ECD2-0B85-44E3-A381-DA556674309E', @RelatedEntityNameFieldMap='Entity';

/* SQL text to update entity field related entity name field map for entity field ID 78458551-7631-4FAF-9FDC-0D06765A1E6B */
EXEC [__mj].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='78458551-7631-4FAF-9FDC-0D06765A1E6B', @RelatedEntityNameFieldMap='Component';

/* SQL text to update entity field related entity name field map for entity field ID ABA778C6-CD79-44ED-95B8-D91A83E6384F */
EXEC [__mj].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='ABA778C6-CD79-44ED-95B8-D91A83E6384F', @RelatedEntityNameFieldMap='User';

/* SQL text to update entity field related entity name field map for entity field ID 1CC7E547-CEF7-420E-88AC-2222BF7298A2 */
EXEC [__mj].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='1CC7E547-CEF7-420E-88AC-2222BF7298A2', @RelatedEntityNameFieldMap='Role';

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
-----               SCHEMA:      __mj
-----               BASE TABLE:  EntityFormOverride
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[__mj].[vwEntityFormOverrides]', 'V') IS NOT NULL
    DROP VIEW [__mj].[vwEntityFormOverrides];
GO

CREATE VIEW [__mj].[vwEntityFormOverrides]
AS
SELECT
    e.*,
    MJEntity_EntityID.[Name] AS [Entity],
    MJComponent_ComponentID.[Name] AS [Component],
    MJUser_UserID.[Name] AS [User],
    MJRole_RoleID.[Name] AS [Role]
FROM
    [__mj].[EntityFormOverride] AS e
INNER JOIN
    [__mj].[Entity] AS MJEntity_EntityID
  ON
    [e].[EntityID] = MJEntity_EntityID.[ID]
INNER JOIN
    [__mj].[Component] AS MJComponent_ComponentID
  ON
    [e].[ComponentID] = MJComponent_ComponentID.[ID]
LEFT OUTER JOIN
    [__mj].[User] AS MJUser_UserID
  ON
    [e].[UserID] = MJUser_UserID.[ID]
LEFT OUTER JOIN
    [__mj].[Role] AS MJRole_RoleID
  ON
    [e].[RoleID] = MJRole_RoleID.[ID]
GO
GRANT SELECT ON [__mj].[vwEntityFormOverrides] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Entity Form Overrides */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Form Overrides
-- Item: Permissions for vwEntityFormOverrides
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [__mj].[vwEntityFormOverrides] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

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
IF OBJECT_ID('[__mj].[spCreateEntityFormOverride]', 'P') IS NOT NULL
    DROP PROCEDURE [__mj].[spCreateEntityFormOverride];
GO

CREATE PROCEDURE [__mj].[spCreateEntityFormOverride]
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
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [__mj].[EntityFormOverride]
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
                [Status]
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
                ISNULL(@Status, 'Active')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [__mj].[EntityFormOverride]
            (
                [EntityID],
                [ComponentID],
                [Name],
                [Description],
                [Scope],
                [UserID],
                [RoleID],
                [Priority],
                [Status]
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
                ISNULL(@Status, 'Active')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntityFormOverrides] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [__mj].[spCreateEntityFormOverride] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Entity Form Overrides */

GRANT EXECUTE ON [__mj].[spCreateEntityFormOverride] TO [cdp_Developer], [cdp_Integration];

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
IF OBJECT_ID('[__mj].[spUpdateEntityFormOverride]', 'P') IS NOT NULL
    DROP PROCEDURE [__mj].[spUpdateEntityFormOverride];
GO

CREATE PROCEDURE [__mj].[spUpdateEntityFormOverride]
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
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [__mj].[EntityFormOverride]
    SET
        [EntityID] = ISNULL(@EntityID, [EntityID]),
        [ComponentID] = ISNULL(@ComponentID, [ComponentID]),
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Scope] = ISNULL(@Scope, [Scope]),
        [UserID] = CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, [UserID]) END,
        [RoleID] = CASE WHEN @RoleID_Clear = 1 THEN NULL ELSE ISNULL(@RoleID, [RoleID]) END,
        [Priority] = ISNULL(@Priority, [Priority]),
        [Status] = ISNULL(@Status, [Status])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [__mj].[vwEntityFormOverrides] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [__mj].[vwEntityFormOverrides]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [__mj].[spUpdateEntityFormOverride] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityFormOverride table
------------------------------------------------------------
IF OBJECT_ID('[__mj].[trgUpdateEntityFormOverride]', 'TR') IS NOT NULL
    DROP TRIGGER [__mj].[trgUpdateEntityFormOverride];
GO
CREATE TRIGGER [__mj].trgUpdateEntityFormOverride
ON [__mj].[EntityFormOverride]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [__mj].[EntityFormOverride]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [__mj].[EntityFormOverride] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Entity Form Overrides */

GRANT EXECUTE ON [__mj].[spUpdateEntityFormOverride] TO [cdp_Developer], [cdp_Integration];

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
IF OBJECT_ID('[__mj].[spDeleteEntityFormOverride]', 'P') IS NOT NULL
    DROP PROCEDURE [__mj].[spDeleteEntityFormOverride];
GO

CREATE PROCEDURE [__mj].[spDeleteEntityFormOverride]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [__mj].[EntityFormOverride]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [__mj].[spDeleteEntityFormOverride] TO [cdp_Integration];

/* spDelete Permissions for MJ: Entity Form Overrides */

GRANT EXECUTE ON [__mj].[spDeleteEntityFormOverride] TO [cdp_Integration];

