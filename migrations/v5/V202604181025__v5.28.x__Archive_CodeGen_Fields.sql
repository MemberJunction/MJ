/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a75f0d9a-17ea-4188-a8a1-9fdfdf874dbd' OR (EntityID = '9E9E1E81-4B52-445F-9591-3479855783DF' AND Name = 'ID')) BEGIN
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
            'a75f0d9a-17ea-4188-a8a1-9fdfdf874dbd',
            '9E9E1E81-4B52-445F-9591-3479855783DF', -- Entity: MJ: Archive Configurations
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8bd68d78-72a4-4561-bf80-81c11c4451d4' OR (EntityID = '9E9E1E81-4B52-445F-9591-3479855783DF' AND Name = 'Name')) BEGIN
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
            '8bd68d78-72a4-4561-bf80-81c11c4451d4',
            '9E9E1E81-4B52-445F-9591-3479855783DF', -- Entity: MJ: Archive Configurations
            100002,
            'Name',
            'Name',
            'Human-readable name for this archive configuration.',
            'nvarchar',
            510,
            0,
            0,
            0,
            NULL,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '87277d15-e523-4bd3-8b1d-4dcbc20e0f0c' OR (EntityID = '9E9E1E81-4B52-445F-9591-3479855783DF' AND Name = 'Description')) BEGIN
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
            '87277d15-e523-4bd3-8b1d-4dcbc20e0f0c',
            '9E9E1E81-4B52-445F-9591-3479855783DF', -- Entity: MJ: Archive Configurations
            100003,
            'Description',
            'Description',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bf0f3e17-e5dc-4d99-bf8b-3e1100101a38' OR (EntityID = '9E9E1E81-4B52-445F-9591-3479855783DF' AND Name = 'StorageAccountID')) BEGIN
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
            'bf0f3e17-e5dc-4d99-bf8b-3e1100101a38',
            '9E9E1E81-4B52-445F-9591-3479855783DF', -- Entity: MJ: Archive Configurations
            100004,
            'StorageAccountID',
            'Storage Account ID',
            'Foreign key to FileStorageAccount — the blob/file storage target for archived data.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            '18033543-B80D-4BF7-ADAF-DE1AA2CF70D0',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c18c6f2a-e4b3-4721-a9a9-1345c649e258' OR (EntityID = '9E9E1E81-4B52-445F-9591-3479855783DF' AND Name = 'RootPath')) BEGIN
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
            'c18c6f2a-e4b3-4721-a9a9-1345c649e258',
            '9E9E1E81-4B52-445F-9591-3479855783DF', -- Entity: MJ: Archive Configurations
            100005,
            'RootPath',
            'Root Path',
            'Root path within the storage account where archive files are written (e.g., "archives/production/").',
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
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cdc6fac2-7fdb-4dbe-abb9-7720c8b283a7' OR (EntityID = '9E9E1E81-4B52-445F-9591-3479855783DF' AND Name = 'ArchiveFormat')) BEGIN
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
            'cdc6fac2-7fdb-4dbe-abb9-7720c8b283a7',
            '9E9E1E81-4B52-445F-9591-3479855783DF', -- Entity: MJ: Archive Configurations
            100006,
            'ArchiveFormat',
            'Archive Format',
            'Output format for archived records: JSON, Parquet, or CSV.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'JSON',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9ae97952-77c7-4ab9-8ff1-0fb92f12c8bd' OR (EntityID = '9E9E1E81-4B52-445F-9591-3479855783DF' AND Name = 'IsActive')) BEGIN
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
            '9ae97952-77c7-4ab9-8ff1-0fb92f12c8bd',
            '9E9E1E81-4B52-445F-9591-3479855783DF', -- Entity: MJ: Archive Configurations
            100007,
            'IsActive',
            'Is Active',
            'Whether this configuration is active and eligible for scheduled archive runs.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ab54ab4d-d92b-4489-b271-e483b321d932' OR (EntityID = '9E9E1E81-4B52-445F-9591-3479855783DF' AND Name = 'DefaultRetentionDays')) BEGIN
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
            'ab54ab4d-d92b-4489-b271-e483b321d932',
            '9E9E1E81-4B52-445F-9591-3479855783DF', -- Entity: MJ: Archive Configurations
            100008,
            'DefaultRetentionDays',
            'Default Retention Days',
            'Default number of days after which records become eligible for archiving. Can be overridden per entity.',
            'int',
            4,
            10,
            0,
            0,
            '(365)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6f9e330d-d751-4b1a-83ae-3085090a2e1e' OR (EntityID = '9E9E1E81-4B52-445F-9591-3479855783DF' AND Name = 'DefaultMode')) BEGIN
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
            '6f9e330d-d751-4b1a-83ae-3085090a2e1e',
            '9E9E1E81-4B52-445F-9591-3479855783DF', -- Entity: MJ: Archive Configurations
            100009,
            'DefaultMode',
            'Default Mode',
            'Default archive mode: StripFields (remove specified fields), SoftDelete (mark as deleted), HardDelete (remove from source), ArchiveOnly (copy without modifying source).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'StripFields',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4a7aa95c-5be4-487e-9ba8-2a575ffa4595' OR (EntityID = '9E9E1E81-4B52-445F-9591-3479855783DF' AND Name = 'DefaultBatchSize')) BEGIN
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
            '4a7aa95c-5be4-487e-9ba8-2a575ffa4595',
            '9E9E1E81-4B52-445F-9591-3479855783DF', -- Entity: MJ: Archive Configurations
            100010,
            'DefaultBatchSize',
            'Default Batch Size',
            'Default number of records to process per batch during archive runs.',
            'int',
            4,
            10,
            0,
            0,
            '(100)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fe733a09-aad4-4888-a0dd-fce4b30fecad' OR (EntityID = '9E9E1E81-4B52-445F-9591-3479855783DF' AND Name = 'ArchiveRelatedRecordChanges')) BEGIN
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
            'fe733a09-aad4-4888-a0dd-fce4b30fecad',
            '9E9E1E81-4B52-445F-9591-3479855783DF', -- Entity: MJ: Archive Configurations
            100011,
            'ArchiveRelatedRecordChanges',
            'Archive Related Record Changes',
            'When enabled, related Record Changes entries are also archived alongside the source records.',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f51053fa-7217-43e6-843e-96359f563416' OR (EntityID = '9E9E1E81-4B52-445F-9591-3479855783DF' AND Name = 'Status')) BEGIN
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
            'f51053fa-7217-43e6-843e-96359f563416',
            '9E9E1E81-4B52-445F-9591-3479855783DF', -- Entity: MJ: Archive Configurations
            100012,
            'Status',
            'Status',
            'Current operational status of this configuration: Idle, Running, Error, or Disabled.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Idle',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '446c9003-5860-4e71-abd5-b9bec5f65000' OR (EntityID = '9E9E1E81-4B52-445F-9591-3479855783DF' AND Name = 'CreatedByUserID')) BEGIN
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
            '446c9003-5860-4e71-abd5-b9bec5f65000',
            '9E9E1E81-4B52-445F-9591-3479855783DF', -- Entity: MJ: Archive Configurations
            100013,
            'CreatedByUserID',
            'Created By User ID',
            'The user who created this archive configuration.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '83f0ee5d-0a8f-4c9a-ab68-c057549e0dd0' OR (EntityID = '9E9E1E81-4B52-445F-9591-3479855783DF' AND Name = '__mj_CreatedAt')) BEGIN
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
            '83f0ee5d-0a8f-4c9a-ab68-c057549e0dd0',
            '9E9E1E81-4B52-445F-9591-3479855783DF', -- Entity: MJ: Archive Configurations
            100014,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '454489c1-2b61-462e-878a-617e08bd354d' OR (EntityID = '9E9E1E81-4B52-445F-9591-3479855783DF' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '454489c1-2b61-462e-878a-617e08bd354d',
            '9E9E1E81-4B52-445F-9591-3479855783DF', -- Entity: MJ: Archive Configurations
            100015,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bd7c59a7-a560-47ac-af25-7fcebfc5ee24' OR (EntityID = '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE' AND Name = 'ID')) BEGIN
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
            'bd7c59a7-a560-47ac-af25-7fcebfc5ee24',
            '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE', -- Entity: MJ: Archive Runs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7ea7babc-6b90-4c5c-838f-b1bfb983a422' OR (EntityID = '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE' AND Name = 'ArchiveConfigurationID')) BEGIN
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
            '7ea7babc-6b90-4c5c-838f-b1bfb983a422',
            '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE', -- Entity: MJ: Archive Runs
            100002,
            'ArchiveConfigurationID',
            'Archive Configuration ID',
            'Foreign key to the ArchiveConfiguration that was executed.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            '9E9E1E81-4B52-445F-9591-3479855783DF',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '07240bd8-2d9e-4d38-b3e8-f940aea886bf' OR (EntityID = '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE' AND Name = 'StartedAt')) BEGIN
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
            '07240bd8-2d9e-4d38-b3e8-f940aea886bf',
            '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE', -- Entity: MJ: Archive Runs
            100003,
            'StartedAt',
            'Started At',
            'Timestamp when the archive run started.',
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '70444110-7cc3-4001-8154-856842e2dea5' OR (EntityID = '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE' AND Name = 'CompletedAt')) BEGIN
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
            '70444110-7cc3-4001-8154-856842e2dea5',
            '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE', -- Entity: MJ: Archive Runs
            100004,
            'CompletedAt',
            'Completed At',
            'Timestamp when the archive run completed (NULL while still running).',
            'datetimeoffset',
            10,
            34,
            7,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd062a5c6-35f2-452e-b83d-c4e8ff777a33' OR (EntityID = '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE' AND Name = 'Status')) BEGIN
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
            'd062a5c6-35f2-452e-b83d-c4e8ff777a33',
            '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE', -- Entity: MJ: Archive Runs
            100005,
            'Status',
            'Status',
            'Current status: Running, Complete, Failed, Cancelled, or PartialSuccess.',
            'nvarchar',
            100,
            0,
            0,
            0,
            'Running',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3ead2440-832e-408f-91e4-a61dbcddb6ac' OR (EntityID = '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE' AND Name = 'TotalRecords')) BEGIN
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
            '3ead2440-832e-408f-91e4-a61dbcddb6ac',
            '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE', -- Entity: MJ: Archive Runs
            100006,
            'TotalRecords',
            'Total Records',
            'Total number of records identified for archiving in this run.',
            'int',
            4,
            10,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2f6b7430-355b-4154-bdd3-1289942e49e8' OR (EntityID = '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE' AND Name = 'ArchivedRecords')) BEGIN
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
            '2f6b7430-355b-4154-bdd3-1289942e49e8',
            '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE', -- Entity: MJ: Archive Runs
            100007,
            'ArchivedRecords',
            'Archived Records',
            'Number of records successfully archived.',
            'int',
            4,
            10,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c57ad1db-e640-42e2-8346-e9205aa8293a' OR (EntityID = '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE' AND Name = 'FailedRecords')) BEGIN
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
            'c57ad1db-e640-42e2-8346-e9205aa8293a',
            '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE', -- Entity: MJ: Archive Runs
            100008,
            'FailedRecords',
            'Failed Records',
            'Number of records that failed to archive.',
            'int',
            4,
            10,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '653fb4e4-1ea8-4a4e-8073-c6cebf833d88' OR (EntityID = '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE' AND Name = 'SkippedRecords')) BEGIN
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
            '653fb4e4-1ea8-4a4e-8073-c6cebf833d88',
            '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE', -- Entity: MJ: Archive Runs
            100009,
            'SkippedRecords',
            'Skipped Records',
            'Number of records skipped (e.g., already archived or filtered out).',
            'int',
            4,
            10,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '177f25ea-a811-4a0d-ab97-f81b00b7ff30' OR (EntityID = '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE' AND Name = 'TotalBytesArchived')) BEGIN
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
            '177f25ea-a811-4a0d-ab97-f81b00b7ff30',
            '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE', -- Entity: MJ: Archive Runs
            100010,
            'TotalBytesArchived',
            'Total Bytes Archived',
            'Total bytes written to archive storage during this run.',
            'bigint',
            8,
            19,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6fa96f8a-a6a7-4581-93ae-38935b63b2d8' OR (EntityID = '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE' AND Name = 'ErrorLog')) BEGIN
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
            '6fa96f8a-a6a7-4581-93ae-38935b63b2d8',
            '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE', -- Entity: MJ: Archive Runs
            100011,
            'ErrorLog',
            'Error Log',
            'Aggregated error log for the run. Contains error details when Status is Failed or PartialSuccess.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'efde0e75-4ea3-4fb6-a402-d87ca08257b2' OR (EntityID = '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE' AND Name = 'UserID')) BEGIN
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
            'efde0e75-4ea3-4fb6-a402-d87ca08257b2',
            '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE', -- Entity: MJ: Archive Runs
            100012,
            'UserID',
            'User ID',
            'The user who initiated this archive run.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7c1eb91a-9ba5-4788-bcc9-328a3d81924a' OR (EntityID = '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE' AND Name = '__mj_CreatedAt')) BEGIN
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
            '7c1eb91a-9ba5-4788-bcc9-328a3d81924a',
            '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE', -- Entity: MJ: Archive Runs
            100013,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2b7e5865-9e44-405c-9ef2-882090ed8759' OR (EntityID = '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '2b7e5865-9e44-405c-9ef2-882090ed8759',
            '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE', -- Entity: MJ: Archive Runs
            100014,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cc9a2dcf-b298-4ee9-b616-047f9e62771f' OR (EntityID = '4DEF6FB6-2A44-46EF-90B9-B91E36084664' AND Name = 'ID')) BEGIN
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
            'cc9a2dcf-b298-4ee9-b616-047f9e62771f',
            '4DEF6FB6-2A44-46EF-90B9-B91E36084664', -- Entity: MJ: Archive Run Details
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3a864e10-5052-4bac-aa5f-d3f25aa277d1' OR (EntityID = '4DEF6FB6-2A44-46EF-90B9-B91E36084664' AND Name = 'ArchiveRunID')) BEGIN
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
            '3a864e10-5052-4bac-aa5f-d3f25aa277d1',
            '4DEF6FB6-2A44-46EF-90B9-B91E36084664', -- Entity: MJ: Archive Run Details
            100002,
            'ArchiveRunID',
            'Archive Run ID',
            'Foreign key to the parent ArchiveRun.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0cb2e616-6085-490f-ae22-c7c56589d34f' OR (EntityID = '4DEF6FB6-2A44-46EF-90B9-B91E36084664' AND Name = 'EntityID')) BEGIN
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
            '0cb2e616-6085-490f-ae22-c7c56589d34f',
            '4DEF6FB6-2A44-46EF-90B9-B91E36084664', -- Entity: MJ: Archive Run Details
            100003,
            'EntityID',
            'Entity ID',
            'Foreign key to the Entity this record belongs to.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'aa055a56-cb10-4a80-be31-1f42e675aecb' OR (EntityID = '4DEF6FB6-2A44-46EF-90B9-B91E36084664' AND Name = 'RecordID')) BEGIN
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
            'aa055a56-cb10-4a80-be31-1f42e675aecb',
            '4DEF6FB6-2A44-46EF-90B9-B91E36084664', -- Entity: MJ: Archive Run Details
            100004,
            'RecordID',
            'Record ID',
            'The primary key value of the archived record (string representation to support all key types).',
            'nvarchar',
            1500,
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
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fc22e925-360a-4095-b289-9a8004ce31da' OR (EntityID = '4DEF6FB6-2A44-46EF-90B9-B91E36084664' AND Name = 'Status')) BEGIN
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
            'fc22e925-360a-4095-b289-9a8004ce31da',
            '4DEF6FB6-2A44-46EF-90B9-B91E36084664', -- Entity: MJ: Archive Run Details
            100005,
            'Status',
            'Status',
            'Outcome for this record: Success, Failed, or Skipped.',
            'nvarchar',
            100,
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
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c13608ca-c298-4d47-80c4-eace68dadb9a' OR (EntityID = '4DEF6FB6-2A44-46EF-90B9-B91E36084664' AND Name = 'StoragePath')) BEGIN
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
            'c13608ca-c298-4d47-80c4-eace68dadb9a',
            '4DEF6FB6-2A44-46EF-90B9-B91E36084664', -- Entity: MJ: Archive Run Details
            100006,
            'StoragePath',
            'Storage Path',
            'Full path to the archived file in storage (e.g., "archives/production/Users/2026/04/record-id.json").',
            'nvarchar',
            2000,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1c8742fa-bb77-4093-99d9-5a5814f1e169' OR (EntityID = '4DEF6FB6-2A44-46EF-90B9-B91E36084664' AND Name = 'BytesArchived')) BEGIN
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
            '1c8742fa-bb77-4093-99d9-5a5814f1e169',
            '4DEF6FB6-2A44-46EF-90B9-B91E36084664', -- Entity: MJ: Archive Run Details
            100007,
            'BytesArchived',
            'Bytes Archived',
            'Number of bytes written to storage for this record.',
            'bigint',
            8,
            19,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5d8ddd06-5af5-43f2-b4e3-6406e8ad040c' OR (EntityID = '4DEF6FB6-2A44-46EF-90B9-B91E36084664' AND Name = 'ErrorMessage')) BEGIN
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
            '5d8ddd06-5af5-43f2-b4e3-6406e8ad040c',
            '4DEF6FB6-2A44-46EF-90B9-B91E36084664', -- Entity: MJ: Archive Run Details
            100008,
            'ErrorMessage',
            'Error Message',
            'Error details when Status is Failed.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b2931a97-5ae7-4542-806e-3c1607cf4e72' OR (EntityID = '4DEF6FB6-2A44-46EF-90B9-B91E36084664' AND Name = 'ArchivedAt')) BEGIN
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
            'b2931a97-5ae7-4542-806e-3c1607cf4e72',
            '4DEF6FB6-2A44-46EF-90B9-B91E36084664', -- Entity: MJ: Archive Run Details
            100009,
            'ArchivedAt',
            'Archived At',
            'Timestamp when this record was successfully archived.',
            'datetimeoffset',
            10,
            34,
            7,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e187943c-2f11-4e8d-9c7b-0d608bfd3b17' OR (EntityID = '4DEF6FB6-2A44-46EF-90B9-B91E36084664' AND Name = 'VersionStamp')) BEGIN
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
            'e187943c-2f11-4e8d-9c7b-0d608bfd3b17',
            '4DEF6FB6-2A44-46EF-90B9-B91E36084664', -- Entity: MJ: Archive Run Details
            100010,
            'VersionStamp',
            'Version Stamp',
            'The __mj_UpdatedAt timestamp of the record at the time of archiving, used for conflict detection during restore.',
            'datetimeoffset',
            10,
            34,
            7,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd8bf622b-1243-48cf-b30c-e686a10e6d85' OR (EntityID = '4DEF6FB6-2A44-46EF-90B9-B91E36084664' AND Name = 'IsRecordChangeArchive')) BEGIN
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
            'd8bf622b-1243-48cf-b30c-e686a10e6d85',
            '4DEF6FB6-2A44-46EF-90B9-B91E36084664', -- Entity: MJ: Archive Run Details
            100011,
            'IsRecordChangeArchive',
            'Is Record Change Archive',
            'When true, this detail row represents an archived Record Change entry rather than a primary entity record.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e984c3f9-9366-4014-b7e0-ad561473475b' OR (EntityID = '4DEF6FB6-2A44-46EF-90B9-B91E36084664' AND Name = '__mj_CreatedAt')) BEGIN
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
            'e984c3f9-9366-4014-b7e0-ad561473475b',
            '4DEF6FB6-2A44-46EF-90B9-B91E36084664', -- Entity: MJ: Archive Run Details
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9633f313-2408-4004-8d19-8bb15c975813' OR (EntityID = '4DEF6FB6-2A44-46EF-90B9-B91E36084664' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '9633f313-2408-4004-8d19-8bb15c975813',
            '4DEF6FB6-2A44-46EF-90B9-B91E36084664', -- Entity: MJ: Archive Run Details
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3ff96817-0bba-4634-a94c-93776939fcd8' OR (EntityID = 'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C' AND Name = 'ID')) BEGIN
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
            '3ff96817-0bba-4634-a94c-93776939fcd8',
            'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C', -- Entity: MJ: Archive Configuration Entities
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f5674b1d-6882-4273-af0b-07a584005af4' OR (EntityID = 'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C' AND Name = 'ArchiveConfigurationID')) BEGIN
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
            'f5674b1d-6882-4273-af0b-07a584005af4',
            'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C', -- Entity: MJ: Archive Configuration Entities
            100002,
            'ArchiveConfigurationID',
            'Archive Configuration ID',
            'Foreign key to the parent ArchiveConfiguration.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            '9E9E1E81-4B52-445F-9591-3479855783DF',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5515a623-1adb-4890-a32d-e24d03219525' OR (EntityID = 'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C' AND Name = 'EntityID')) BEGIN
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
            '5515a623-1adb-4890-a32d-e24d03219525',
            'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C', -- Entity: MJ: Archive Configuration Entities
            100003,
            'EntityID',
            'Entity ID',
            'Foreign key to the Entity being archived.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
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
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '749dad24-9833-4e3d-9b81-85028889b745' OR (EntityID = 'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C' AND Name = 'Mode')) BEGIN
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
            '749dad24-9833-4e3d-9b81-85028889b745',
            'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C', -- Entity: MJ: Archive Configuration Entities
            100004,
            'Mode',
            'Mode',
            'Archive mode override for this entity. NULL inherits from the parent configuration''s DefaultMode.',
            'nvarchar',
            40,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8effe3f6-d215-4b59-8472-83eed81a2502' OR (EntityID = 'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C' AND Name = 'RetentionDays')) BEGIN
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
            '8effe3f6-d215-4b59-8472-83eed81a2502',
            'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C', -- Entity: MJ: Archive Configuration Entities
            100005,
            'RetentionDays',
            'Retention Days',
            'Retention period override in days. NULL inherits from the parent configuration''s DefaultRetentionDays.',
            'int',
            4,
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '82ad26d7-a063-4b22-b509-50ceb5a223a8' OR (EntityID = 'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C' AND Name = 'DateField')) BEGIN
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
            '82ad26d7-a063-4b22-b509-50ceb5a223a8',
            'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C', -- Entity: MJ: Archive Configuration Entities
            100006,
            'DateField',
            'Date Field',
            'The date field on the entity used to determine record age for retention policy evaluation. Defaults to __mj_CreatedAt.',
            'nvarchar',
            200,
            0,
            0,
            0,
            '__mj_CreatedAt',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '66d1fb7c-9677-4f11-a459-e3c6352cfd00' OR (EntityID = 'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C' AND Name = 'FilterExpression')) BEGIN
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
            '66d1fb7c-9677-4f11-a459-e3c6352cfd00',
            'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C', -- Entity: MJ: Archive Configuration Entities
            100007,
            'FilterExpression',
            'Filter Expression',
            'Optional SQL WHERE clause fragment to further filter which records are eligible for archiving (e.g., "Status = ''Closed''").',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8582e389-f45b-42ef-ba2d-4d16e524882e' OR (EntityID = 'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C' AND Name = 'BatchSize')) BEGIN
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
            '8582e389-f45b-42ef-ba2d-4d16e524882e',
            'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C', -- Entity: MJ: Archive Configuration Entities
            100008,
            'BatchSize',
            'Batch Size',
            'Batch size override for this entity. NULL inherits from the parent configuration''s DefaultBatchSize.',
            'int',
            4,
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '20db8628-2e83-44df-af79-55d808d96cd9' OR (EntityID = 'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C' AND Name = 'Priority')) BEGIN
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
            '20db8628-2e83-44df-af79-55d808d96cd9',
            'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C', -- Entity: MJ: Archive Configuration Entities
            100009,
            'Priority',
            'Priority',
            'Processing priority — lower numbers are archived first. Default is 100.',
            'int',
            4,
            10,
            0,
            0,
            '(100)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bdcd5a93-6608-4b8d-b689-646a37ce67ec' OR (EntityID = 'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C' AND Name = 'FieldConfiguration')) BEGIN
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
            'bdcd5a93-6608-4b8d-b689-646a37ce67ec',
            'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C', -- Entity: MJ: Archive Configuration Entities
            100010,
            'FieldConfiguration',
            'Field Configuration',
            'JSON configuration specifying which fields to include/exclude in the archive output. Required for all modes.',
            'nvarchar',
            -1,
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
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6afb38a6-2320-496b-b4b5-0cb48109b1a7' OR (EntityID = 'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C' AND Name = 'DriverClass')) BEGIN
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
            '6afb38a6-2320-496b-b4b5-0cb48109b1a7',
            'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C', -- Entity: MJ: Archive Configuration Entities
            100011,
            'DriverClass',
            'Driver Class',
            'Optional fully-qualified class name of a custom archive driver to use for this entity, overriding the default archiver.',
            'nvarchar',
            1000,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fa6e22ee-9fef-4c6c-a886-23c94c376b70' OR (EntityID = 'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C' AND Name = 'ArchiveRelatedRecordChanges')) BEGIN
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
            'fa6e22ee-9fef-4c6c-a886-23c94c376b70',
            'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C', -- Entity: MJ: Archive Configuration Entities
            100012,
            'ArchiveRelatedRecordChanges',
            'Archive Related Record Changes',
            'Override for archiving related Record Changes. NULL inherits from the parent configuration.',
            'bit',
            1,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b3088c57-0da8-4ffc-8928-dc96d9bfa087' OR (EntityID = 'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C' AND Name = 'IsActive')) BEGIN
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
            'b3088c57-0da8-4ffc-8928-dc96d9bfa087',
            'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C', -- Entity: MJ: Archive Configuration Entities
            100013,
            'IsActive',
            'Is Active',
            'Whether this entity is active within the archive configuration.',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7bc9b9f8-1535-4cf8-98c8-7e84aeb926cd' OR (EntityID = 'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C' AND Name = '__mj_CreatedAt')) BEGIN
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
            '7bc9b9f8-1535-4cf8-98c8-7e84aeb926cd',
            'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C', -- Entity: MJ: Archive Configuration Entities
            100014,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3a8f9f64-0122-4edb-b079-2fbcf1dc90e0' OR (EntityID = 'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '3a8f9f64-0122-4edb-b079-2fbcf1dc90e0',
            'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C', -- Entity: MJ: Archive Configuration Entities
            100015,
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

/* SQL text to insert entity field value with ID f3cdd818-d0fe-433a-97b7-9b8fac4c3267 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f3cdd818-d0fe-433a-97b7-9b8fac4c3267', 'CDC6FAC2-7FDB-4DBE-ABB9-7720C8B283A7', 1, 'CSV', 'CSV', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 230ad7cd-c43a-4c1c-8acf-eebc6882f9e6 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('230ad7cd-c43a-4c1c-8acf-eebc6882f9e6', 'CDC6FAC2-7FDB-4DBE-ABB9-7720C8B283A7', 2, 'JSON', 'JSON', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 7119b696-b8df-47e3-b8d6-594c6b5377bc */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7119b696-b8df-47e3-b8d6-594c6b5377bc', 'CDC6FAC2-7FDB-4DBE-ABB9-7720C8B283A7', 3, 'Parquet', 'Parquet', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID CDC6FAC2-7FDB-4DBE-ABB9-7720C8B283A7 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='CDC6FAC2-7FDB-4DBE-ABB9-7720C8B283A7'

/* SQL text to insert entity field value with ID 3995d603-1452-4405-a2cd-513be38ca8d8 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3995d603-1452-4405-a2cd-513be38ca8d8', '6F9E330D-D751-4B1A-83AE-3085090A2E1E', 1, 'ArchiveOnly', 'ArchiveOnly', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID c10b5534-91b6-4543-a284-3eeebf353fdb */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c10b5534-91b6-4543-a284-3eeebf353fdb', '6F9E330D-D751-4B1A-83AE-3085090A2E1E', 2, 'HardDelete', 'HardDelete', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 6efc1aaf-709c-4b2d-bed5-d452d0d2a7ee */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6efc1aaf-709c-4b2d-bed5-d452d0d2a7ee', '6F9E330D-D751-4B1A-83AE-3085090A2E1E', 3, 'SoftDelete', 'SoftDelete', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 520095fd-33cf-4d30-b347-f37103b0dfea */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('520095fd-33cf-4d30-b347-f37103b0dfea', '6F9E330D-D751-4B1A-83AE-3085090A2E1E', 4, 'StripFields', 'StripFields', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID 6F9E330D-D751-4B1A-83AE-3085090A2E1E */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='6F9E330D-D751-4B1A-83AE-3085090A2E1E'

/* SQL text to insert entity field value with ID 81d8a7e5-2bfd-4180-8045-a09bcee45472 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('81d8a7e5-2bfd-4180-8045-a09bcee45472', 'F51053FA-7217-43E6-843E-96359F563416', 1, 'Disabled', 'Disabled', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID c867f7d4-227a-4c50-8a34-a03a5041cf20 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c867f7d4-227a-4c50-8a34-a03a5041cf20', 'F51053FA-7217-43E6-843E-96359F563416', 2, 'Error', 'Error', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID a2b81177-d3a1-4393-ab2e-c91daf54e390 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a2b81177-d3a1-4393-ab2e-c91daf54e390', 'F51053FA-7217-43E6-843E-96359F563416', 3, 'Idle', 'Idle', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID e6ecbc98-a22e-43f2-bae6-3baaebe0bc1a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e6ecbc98-a22e-43f2-bae6-3baaebe0bc1a', 'F51053FA-7217-43E6-843E-96359F563416', 4, 'Running', 'Running', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID F51053FA-7217-43E6-843E-96359F563416 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='F51053FA-7217-43E6-843E-96359F563416'

/* SQL text to insert entity field value with ID 87b08f5e-a7b3-4510-8c18-4631c1f02481 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('87b08f5e-a7b3-4510-8c18-4631c1f02481', 'D062A5C6-35F2-452E-B83D-C4E8FF777A33', 1, 'Cancelled', 'Cancelled', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID c33ebb67-ca34-4a37-8a02-07b09ec2f320 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c33ebb67-ca34-4a37-8a02-07b09ec2f320', 'D062A5C6-35F2-452E-B83D-C4E8FF777A33', 2, 'Complete', 'Complete', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID cbfd689f-8746-4afb-ab17-2df861a766cb */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('cbfd689f-8746-4afb-ab17-2df861a766cb', 'D062A5C6-35F2-452E-B83D-C4E8FF777A33', 3, 'Failed', 'Failed', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 71b28ccc-4fb8-4c7f-bc28-e942a97c5ded */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('71b28ccc-4fb8-4c7f-bc28-e942a97c5ded', 'D062A5C6-35F2-452E-B83D-C4E8FF777A33', 4, 'PartialSuccess', 'PartialSuccess', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID b9a40dac-6949-4e3b-bda4-623e0ac6cd5c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b9a40dac-6949-4e3b-bda4-623e0ac6cd5c', 'D062A5C6-35F2-452E-B83D-C4E8FF777A33', 5, 'Running', 'Running', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID D062A5C6-35F2-452E-B83D-C4E8FF777A33 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='D062A5C6-35F2-452E-B83D-C4E8FF777A33'

/* SQL text to insert entity field value with ID c6c2e7f7-1897-4bbe-b2c3-ebe88a288736 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c6c2e7f7-1897-4bbe-b2c3-ebe88a288736', 'FC22E925-360A-4095-B289-9A8004CE31DA', 1, 'Failed', 'Failed', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 4f22b64b-ae77-4d93-a081-1e281e764334 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4f22b64b-ae77-4d93-a081-1e281e764334', 'FC22E925-360A-4095-B289-9A8004CE31DA', 2, 'Skipped', 'Skipped', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 3c682a56-0975-45ae-bd3d-d65f51702831 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3c682a56-0975-45ae-bd3d-d65f51702831', 'FC22E925-360A-4095-B289-9A8004CE31DA', 3, 'Success', 'Success', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID FC22E925-360A-4095-B289-9A8004CE31DA */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='FC22E925-360A-4095-B289-9A8004CE31DA'

/* SQL text to insert entity field value with ID 40d3c94f-05bd-41cc-b384-5c8c11674914 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('40d3c94f-05bd-41cc-b384-5c8c11674914', '749DAD24-9833-4E3D-9B81-85028889B745', 1, 'ArchiveOnly', 'ArchiveOnly', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 363c6e63-63bb-422d-bd01-7b475e203c06 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('363c6e63-63bb-422d-bd01-7b475e203c06', '749DAD24-9833-4E3D-9B81-85028889B745', 2, 'HardDelete', 'HardDelete', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID ee28e116-e09a-44d9-a193-3b35704be58c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ee28e116-e09a-44d9-a193-3b35704be58c', '749DAD24-9833-4E3D-9B81-85028889B745', 3, 'SoftDelete', 'SoftDelete', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 5c0ad664-8b35-45d9-b2df-d370ae60ad0d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5c0ad664-8b35-45d9-b2df-d370ae60ad0d', '749DAD24-9833-4E3D-9B81-85028889B745', 4, 'StripFields', 'StripFields', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID 749DAD24-9833-4E3D-9B81-85028889B745 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='749DAD24-9833-4E3D-9B81-85028889B745'


/* Create Entity Relationship: MJ: Archive Configurations -> MJ: Archive Configuration Entities (One To Many via ArchiveConfigurationID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'c9f20ffa-2ae0-4bcb-824d-694c12539611'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('c9f20ffa-2ae0-4bcb-824d-694c12539611', '9E9E1E81-4B52-445F-9591-3479855783DF', 'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C', 'ArchiveConfigurationID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Archive Configurations -> MJ: Archive Runs (One To Many via ArchiveConfigurationID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'bb6bfca8-0c77-4676-81eb-aeb90e3d16a8'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('bb6bfca8-0c77-4676-81eb-aeb90e3d16a8', '9E9E1E81-4B52-445F-9591-3479855783DF', '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE', 'ArchiveConfigurationID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Entities -> MJ: Archive Configuration Entities (One To Many via EntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '2bf67f91-0414-4957-b350-ed157b93a280'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('2bf67f91-0414-4957-b350-ed157b93a280', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'EC8518A0-5C7D-4A5B-BC44-F05DA3D6F15C', 'EntityID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Entities -> MJ: Archive Run Details (One To Many via EntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'b2077234-8c04-4d86-a97a-87ab36a91eb5'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('b2077234-8c04-4d86-a97a-87ab36a91eb5', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '4DEF6FB6-2A44-46EF-90B9-B91E36084664', 'EntityID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Users -> MJ: Archive Runs (One To Many via UserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '3fe5f092-236e-4a60-a699-c58fc3a896a7'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('3fe5f092-236e-4a60-a699-c58fc3a896a7', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE', 'UserID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Users -> MJ: Archive Configurations (One To Many via CreatedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '4f3f16a5-5f37-47cc-b5c8-6f70421ba0b1'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('4f3f16a5-5f37-47cc-b5c8-6f70421ba0b1', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '9E9E1E81-4B52-445F-9591-3479855783DF', 'CreatedByUserID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Archive Runs -> MJ: Archive Run Details (One To Many via ArchiveRunID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'df60e6db-fd01-42df-adea-4d56fbbf2588'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('df60e6db-fd01-42df-adea-4d56fbbf2588', '3F4636B0-4EEA-4E0F-A4C8-B884A9596CCE', '4DEF6FB6-2A44-46EF-90B9-B91E36084664', 'ArchiveRunID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: File Storage Accounts -> MJ: Archive Configurations (One To Many via StorageAccountID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '555a716f-a9e5-4364-9c42-75052269c486'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('555a716f-a9e5-4364-9c42-75052269c486', '18033543-B80D-4BF7-ADAF-DE1AA2CF70D0', '9E9E1E81-4B52-445F-9591-3479855783DF', 'StorageAccountID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    

/* Index for Foreign Keys for ArchiveConfigurationEntity */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Configuration Entities
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ArchiveConfigurationID in table ArchiveConfigurationEntity
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ArchiveConfigurationEntity_ArchiveConfigurationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArchiveConfigurationEntity]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ArchiveConfigurationEntity_ArchiveConfigurationID ON [${flyway:defaultSchema}].[ArchiveConfigurationEntity] ([ArchiveConfigurationID]);

-- Index for foreign key EntityID in table ArchiveConfigurationEntity
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ArchiveConfigurationEntity_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArchiveConfigurationEntity]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ArchiveConfigurationEntity_EntityID ON [${flyway:defaultSchema}].[ArchiveConfigurationEntity] ([EntityID]);

/* SQL text to update entity field related entity name field map for entity field ID F5674B1D-6882-4273-AF0B-07A584005AF4 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='F5674B1D-6882-4273-AF0B-07A584005AF4', @RelatedEntityNameFieldMap='ArchiveConfiguration'

/* Index for Foreign Keys for ArchiveConfiguration */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Configurations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key StorageAccountID in table ArchiveConfiguration
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ArchiveConfiguration_StorageAccountID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArchiveConfiguration]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ArchiveConfiguration_StorageAccountID ON [${flyway:defaultSchema}].[ArchiveConfiguration] ([StorageAccountID]);

-- Index for foreign key CreatedByUserID in table ArchiveConfiguration
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ArchiveConfiguration_CreatedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArchiveConfiguration]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ArchiveConfiguration_CreatedByUserID ON [${flyway:defaultSchema}].[ArchiveConfiguration] ([CreatedByUserID]);

/* SQL text to update entity field related entity name field map for entity field ID BF0F3E17-E5DC-4D99-BF8B-3E1100101A38 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='BF0F3E17-E5DC-4D99-BF8B-3E1100101A38', @RelatedEntityNameFieldMap='StorageAccount'

/* Index for Foreign Keys for ArchiveRunDetail */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Run Details
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ArchiveRunID in table ArchiveRunDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ArchiveRunDetail_ArchiveRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArchiveRunDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ArchiveRunDetail_ArchiveRunID ON [${flyway:defaultSchema}].[ArchiveRunDetail] ([ArchiveRunID]);

-- Index for foreign key EntityID in table ArchiveRunDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ArchiveRunDetail_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArchiveRunDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ArchiveRunDetail_EntityID ON [${flyway:defaultSchema}].[ArchiveRunDetail] ([EntityID]);

/* SQL text to update entity field related entity name field map for entity field ID 0CB2E616-6085-490F-AE22-C7C56589D34F */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='0CB2E616-6085-490F-AE22-C7C56589D34F', @RelatedEntityNameFieldMap='Entity'

/* Index for Foreign Keys for ArchiveRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ArchiveConfigurationID in table ArchiveRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ArchiveRun_ArchiveConfigurationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArchiveRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ArchiveRun_ArchiveConfigurationID ON [${flyway:defaultSchema}].[ArchiveRun] ([ArchiveConfigurationID]);

-- Index for foreign key UserID in table ArchiveRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ArchiveRun_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArchiveRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ArchiveRun_UserID ON [${flyway:defaultSchema}].[ArchiveRun] ([UserID]);

/* SQL text to update entity field related entity name field map for entity field ID 7EA7BABC-6B90-4C5C-838F-B1BFB983A422 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='7EA7BABC-6B90-4C5C-838F-B1BFB983A422', @RelatedEntityNameFieldMap='ArchiveConfiguration'

/* SQL text to update entity field related entity name field map for entity field ID 5515A623-1ADB-4890-A32D-E24D03219525 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='5515A623-1ADB-4890-A32D-E24D03219525', @RelatedEntityNameFieldMap='Entity'

/* SQL text to update entity field related entity name field map for entity field ID EFDE0E75-4EA3-4FB6-A402-D87CA08257B2 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='EFDE0E75-4EA3-4FB6-A402-D87CA08257B2', @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID 446C9003-5860-4E71-ABD5-B9BEC5F65000 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='446C9003-5860-4E71-ABD5-B9BEC5F65000', @RelatedEntityNameFieldMap='CreatedByUser'
