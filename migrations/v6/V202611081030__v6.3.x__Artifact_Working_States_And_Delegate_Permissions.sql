-- =====================================================================================
-- Artifact Working States & Delegate Permissions
--
-- 1. Creates `${flyway:defaultSchema}.ArtifactWorkingState` (`MJ: Artifact Working States`)
--    to hold the live compacted Yjs CRDT working state (`YjsState VARBINARY(MAX)`) for
--    an active collaborative artifact session (1:1 per ArtifactID) without bloating
--    `MJ: Artifact Versions` with every keystroke or checkpoint.
--
-- 2. Extends `${flyway:defaultSchema}.Artifact` (`MJ: Artifacts`) with optional
--    polymorphic permission delegation columns (`DelegateEntityID`, `DelegateRecordID`)
--    so host entities (or parent artifacts hosting embedded OLE child artifacts) can
--    govern access via `IArtifactPermissionDelegate` while falling back to
--    `MJ: Artifact Permissions` when NULL.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. ArtifactWorkingState (`MJ: Artifact Working States`)
-- -------------------------------------------------------------------------------------
CREATE TABLE [${flyway:defaultSchema}].[ArtifactWorkingState] (
    [ID]                   UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_ArtifactWorkingState_ID] DEFAULT (newsequentialid()),
    [ArtifactID]           UNIQUEIDENTIFIER NOT NULL,
    [YjsState]             VARBINARY(MAX)   NULL,
    [LastModifiedByUserID] UNIQUEIDENTIFIER NULL,
    CONSTRAINT [PK_ArtifactWorkingState] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_ArtifactWorkingState_ArtifactID] UNIQUE ([ArtifactID]),
    CONSTRAINT [FK_ArtifactWorkingState_Artifact] FOREIGN KEY ([ArtifactID])
        REFERENCES [${flyway:defaultSchema}].[Artifact]([ID])
        ON DELETE CASCADE,
    CONSTRAINT [FK_ArtifactWorkingState_LastModifiedByUser] FOREIGN KEY ([LastModifiedByUserID])
        REFERENCES [${flyway:defaultSchema}].[User]([ID])
);
GO

-- -------------------------------------------------------------------------------------
-- 2. Artifact Delegate Permission Columns (`MJ: Artifacts`)
-- -------------------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[Artifact]
ADD [DelegateEntityID] UNIQUEIDENTIFIER NULL
        CONSTRAINT [FK_Artifact_DelegateEntity]
        FOREIGN KEY REFERENCES [${flyway:defaultSchema}].[Entity]([ID]),
    [DelegateRecordID] NVARCHAR(700) NULL,
    CONSTRAINT [CK_Artifact_DelegateBinding]
        CHECK (([DelegateEntityID] IS NULL AND [DelegateRecordID] IS NULL)
            OR ([DelegateEntityID] IS NOT NULL AND [DelegateRecordID] IS NOT NULL));
GO

-- -------------------------------------------------------------------------------------
-- 3. Extended Properties (Table & Column Descriptions)
-- -------------------------------------------------------------------------------------
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores the live compacted Yjs CRDT binary working state (1:1 per Artifact) for active collaborative editing sessions across MJ Docs, Slides, Sheets, and inline OLE artifacts before compaction into immutable MJ: Artifact Versions checkpoints.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ArtifactWorkingState';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The Artifact whose active collaborative CRDT state is stored in this working state record (1:1 relationship).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ArtifactWorkingState',
    @level2type = N'COLUMN', @level2name = N'ArtifactID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Compacted Yjs CRDT state vector (Y.encodeStateAsUpdate) stored as binary bytes (exposed as base64 in TypeScript entities). Periodically checkpointed during active editing and compacted into MJ: Artifact Versions on save or session close.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ArtifactWorkingState',
    @level2type = N'COLUMN', @level2name = N'YjsState';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'User who most recently modified or checkpointed this working state.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ArtifactWorkingState',
    @level2type = N'COLUMN', @level2name = N'LastModifiedByUserID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional foreign key to MJ: Entities identifying the host entity that delegates read/edit/delete/share permissions for this artifact via IArtifactPermissionDelegate (or parent artifact inheritance). Must be paired with DelegateRecordID.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Artifact',
    @level2type = N'COLUMN', @level2name = N'DelegateEntityID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key or composite key string of the record in DelegateEntityID that governs permissions for this artifact. When NULL (along with DelegateEntityID), permissions are evaluated strictly from MJ: Artifact Permissions and artifact ownership.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Artifact',
    @level2type = N'COLUMN', @level2name = N'DelegateRecordID';
GO






















































-- =============================================================================
-- =============================================================================
-- =============================================================================
--
--                    CODEGEN OUTPUT BELOW THIS LINE
--
-- Everything below this block was generated by the MemberJunction CodeGen tool
-- after the hand-written DDL above was applied to a clean database built from
-- the committed migrations and metadata.
--
-- DO NOT EDIT BY HAND. If the hand-written DDL above changes, re-run CodeGen
-- and replace this entire section with the fresh output.
--
-- =============================================================================
-- =============================================================================
-- =============================================================================

/* SQL generated to create new entity MJ: Artifact Working States */

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
         '0ba6990d-dc4f-408e-a748-8f64b3039533',
         'MJ: Artifact Working States',
         'Artifact Working States',
         'Stores the live compacted Yjs CRDT binary working state (1:1 per Artifact) for active collaborative editing sessions across MJ Docs, Slides, Sheets, and inline OLE artifacts before compaction into immutable MJ: Artifact Versions checkpoints.',
         NULL,
         'ArtifactWorkingState',
         'vwArtifactWorkingStates',
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

/* SQL generated to add new entity MJ: Artifact Working States to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '0ba6990d-dc4f-408e-a748-8f64b3039533', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Artifact Working States for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('0ba6990d-dc4f-408e-a748-8f64b3039533' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('0ba6990d-dc4f-408e-a748-8f64b3039533' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Artifact Working States for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('0ba6990d-dc4f-408e-a748-8f64b3039533' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('0ba6990d-dc4f-408e-a748-8f64b3039533' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Artifact Working States for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('0ba6990d-dc4f-408e-a748-8f64b3039533' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('0ba6990d-dc4f-408e-a748-8f64b3039533' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ArtifactWorkingState */
ALTER TABLE [${flyway:defaultSchema}].[ArtifactWorkingState] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ArtifactWorkingState */
UPDATE [${flyway:defaultSchema}].[ArtifactWorkingState] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ArtifactWorkingState */
ALTER TABLE [${flyway:defaultSchema}].[ArtifactWorkingState] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ArtifactWorkingState */
ALTER TABLE [${flyway:defaultSchema}].[ArtifactWorkingState] ADD CONSTRAINT [DF___mj_ArtifactWorkingState___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ArtifactWorkingState */
ALTER TABLE [${flyway:defaultSchema}].[ArtifactWorkingState] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ArtifactWorkingState */
UPDATE [${flyway:defaultSchema}].[ArtifactWorkingState] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ArtifactWorkingState */
ALTER TABLE [${flyway:defaultSchema}].[ArtifactWorkingState] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ArtifactWorkingState */
ALTER TABLE [${flyway:defaultSchema}].[ArtifactWorkingState] ADD CONSTRAINT [DF___mj_ArtifactWorkingState___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 8 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1e659159-b093-4f1f-aedc-51785178f448' OR (EntityID = 'F48D2341-8667-40BB-BCA8-87D7F80E16CD' AND Name = 'DelegateEntityID')) BEGIN
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
            '1e659159-b093-4f1f-aedc-51785178f448',
            'F48D2341-8667-40BB-BCA8-87D7F80E16CD', -- Entity: MJ: Artifacts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F48D2341-8667-40BB-BCA8-87D7F80E16CD'),
            'DelegateEntityID',
            'Delegate Entity ID',
            'Optional foreign key to MJ: Entities identifying the host entity that delegates read/edit/delete/share permissions for this artifact via IArtifactPermissionDelegate (or parent artifact inheritance). Must be paired with DelegateRecordID.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f6a80adc-8465-40d5-a2c6-8e654c28b9df' OR (EntityID = 'F48D2341-8667-40BB-BCA8-87D7F80E16CD' AND Name = 'DelegateRecordID')) BEGIN
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
            'f6a80adc-8465-40d5-a2c6-8e654c28b9df',
            'F48D2341-8667-40BB-BCA8-87D7F80E16CD', -- Entity: MJ: Artifacts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F48D2341-8667-40BB-BCA8-87D7F80E16CD'),
            'DelegateRecordID',
            'Delegate Record ID',
            'Primary key or composite key string of the record in DelegateEntityID that governs permissions for this artifact. When NULL (along with DelegateEntityID), permissions are evaluated strictly from MJ: Artifact Permissions and artifact ownership.',
            'nvarchar',
            1400,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c376edc3-3659-4e11-b6fa-089ff49126a9' OR (EntityID = '0BA6990D-DC4F-408E-A748-8F64B3039533' AND Name = 'ID')) BEGIN
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
            'c376edc3-3659-4e11-b6fa-089ff49126a9',
            '0BA6990D-DC4F-408E-A748-8F64B3039533', -- Entity: MJ: Artifact Working States
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0BA6990D-DC4F-408E-A748-8F64B3039533'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a903956a-2f7d-44b1-890b-76dbaf8c0d96' OR (EntityID = '0BA6990D-DC4F-408E-A748-8F64B3039533' AND Name = 'ArtifactID')) BEGIN
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
            'a903956a-2f7d-44b1-890b-76dbaf8c0d96',
            '0BA6990D-DC4F-408E-A748-8F64B3039533', -- Entity: MJ: Artifact Working States
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0BA6990D-DC4F-408E-A748-8F64B3039533'),
            'ArtifactID',
            'Artifact ID',
            'The Artifact whose active collaborative CRDT state is stored in this working state record (1:1 relationship).',
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
            'F48D2341-8667-40BB-BCA8-87D7F80E16CD',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c074034c-27e4-4798-86ab-64e7949fd967' OR (EntityID = '0BA6990D-DC4F-408E-A748-8F64B3039533' AND Name = 'YjsState')) BEGIN
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
            'c074034c-27e4-4798-86ab-64e7949fd967',
            '0BA6990D-DC4F-408E-A748-8F64B3039533', -- Entity: MJ: Artifact Working States
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0BA6990D-DC4F-408E-A748-8F64B3039533'),
            'YjsState',
            'Yjs State',
            'Compacted Yjs CRDT state vector (Y.encodeStateAsUpdate) stored as binary bytes (exposed as base64 in TypeScript entities). Periodically checkpointed during active editing and compacted into MJ: Artifact Versions on save or session close.',
            'varbinary',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cb1d12dc-250f-461a-adeb-2efd9ba4acc2' OR (EntityID = '0BA6990D-DC4F-408E-A748-8F64B3039533' AND Name = 'LastModifiedByUserID')) BEGIN
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
            'cb1d12dc-250f-461a-adeb-2efd9ba4acc2',
            '0BA6990D-DC4F-408E-A748-8F64B3039533', -- Entity: MJ: Artifact Working States
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0BA6990D-DC4F-408E-A748-8F64B3039533'),
            'LastModifiedByUserID',
            'Last Modified By User ID',
            'User who most recently modified or checkpointed this working state.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8973b966-fce0-444d-b682-98ba77f46b6b' OR (EntityID = '0BA6990D-DC4F-408E-A748-8F64B3039533' AND Name = '__mj_CreatedAt')) BEGIN
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
            '8973b966-fce0-444d-b682-98ba77f46b6b',
            '0BA6990D-DC4F-408E-A748-8F64B3039533', -- Entity: MJ: Artifact Working States
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0BA6990D-DC4F-408E-A748-8F64B3039533'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '308dab79-ddaf-4bbc-9562-275da7a704ef' OR (EntityID = '0BA6990D-DC4F-408E-A748-8F64B3039533' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '308dab79-ddaf-4bbc-9562-275da7a704ef',
            '0BA6990D-DC4F-408E-A748-8F64B3039533', -- Entity: MJ: Artifact Working States
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0BA6990D-DC4F-408E-A748-8F64B3039533'),
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


/* Create Entity Relationship: MJ: Entities -> MJ: Artifacts (One To Many via DelegateEntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '23005e76-1dc0-48b5-a65b-d681b20e78bb'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('23005e76-1dc0-48b5-a65b-d681b20e78bb', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'F48D2341-8667-40BB-BCA8-87D7F80E16CD', 'DelegateEntityID', 'One To Many', 1, 1, 93, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ: Artifact Working States (One To Many via LastModifiedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '453c5dba-2be7-4d15-8d01-5967a1b24ad1'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('453c5dba-2be7-4d15-8d01-5967a1b24ad1', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '0BA6990D-DC4F-408E-A748-8F64B3039533', 'LastModifiedByUserID', 'One To Many', 1, 1, 130, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Artifacts -> MJ: Artifact Working States (One To Many via ArtifactID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '8e53f559-3c10-4500-bc30-c8a61d76b951'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('8e53f559-3c10-4500-bc30-c8a61d76b951', 'F48D2341-8667-40BB-BCA8-87D7F80E16CD', '0BA6990D-DC4F-408E-A748-8F64B3039533', 'ArtifactID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for ArtifactWorkingState */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Working States
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ArtifactID in table ArtifactWorkingState
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ArtifactWorkingState_ArtifactID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArtifactWorkingState]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ArtifactWorkingState_ArtifactID ON [${flyway:defaultSchema}].[ArtifactWorkingState] ([ArtifactID]);

-- Index for foreign key LastModifiedByUserID in table ArtifactWorkingState
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ArtifactWorkingState_LastModifiedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArtifactWorkingState]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ArtifactWorkingState_LastModifiedByUserID ON [${flyway:defaultSchema}].[ArtifactWorkingState] ([LastModifiedByUserID]);

/* SQL text to update entity field related entity name field map for entity field ID A903956A-2F7D-44B1-890B-76DBAF8C0D96 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='A903956A-2F7D-44B1-890B-76DBAF8C0D96', @RelatedEntityNameFieldMap='Artifact';

/* Index for Foreign Keys for Artifact */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifacts
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EnvironmentID in table Artifact
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Artifact_EnvironmentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Artifact]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Artifact_EnvironmentID ON [${flyway:defaultSchema}].[Artifact] ([EnvironmentID]);

-- Index for foreign key TypeID in table Artifact
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Artifact_TypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Artifact]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Artifact_TypeID ON [${flyway:defaultSchema}].[Artifact] ([TypeID]);

-- Index for foreign key UserID in table Artifact
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Artifact_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Artifact]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Artifact_UserID ON [${flyway:defaultSchema}].[Artifact] ([UserID]);

-- Index for foreign key DelegateEntityID in table Artifact
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Artifact_DelegateEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Artifact]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Artifact_DelegateEntityID ON [${flyway:defaultSchema}].[Artifact] ([DelegateEntityID]);

/* SQL text to update entity field related entity name field map for entity field ID 1E659159-B093-4F1F-AEDC-51785178F448 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='1E659159-B093-4F1F-AEDC-51785178F448', @RelatedEntityNameFieldMap='DelegateEntity';

/* Base View SQL for MJ: Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifacts
-- Item: vwArtifacts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Artifacts
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Artifact
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwArtifacts]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwArtifacts];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwArtifacts]
AS
SELECT
    a.*,
    MJEnvironment_EnvironmentID.[Name] AS [Environment],
    MJArtifactType_TypeID.[Name] AS [Type],
    MJUser_UserID.[Name] AS [User],
    MJEntity_DelegateEntityID.[Name] AS [DelegateEntity]
FROM
    [${flyway:defaultSchema}].[Artifact] AS a
INNER JOIN
    [${flyway:defaultSchema}].[Environment] AS MJEnvironment_EnvironmentID
  ON
    [a].[EnvironmentID] = MJEnvironment_EnvironmentID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[ArtifactType] AS MJArtifactType_TypeID
  ON
    [a].[TypeID] = MJArtifactType_TypeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [a].[UserID] = MJUser_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_DelegateEntityID
  ON
    [a].[DelegateEntityID] = MJEntity_DelegateEntityID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwArtifacts] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwArtifacts] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwArtifacts] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwArtifacts] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifacts
-- Item: Permissions for vwArtifacts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwArtifacts] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwArtifacts] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwArtifacts] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwArtifacts] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifacts
-- Item: spCreateArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Artifact
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateArtifact]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateArtifact];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateArtifact]
    @ID uniqueidentifier = NULL,
    @EnvironmentID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @TypeID uniqueidentifier,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL,
    @UserID uniqueidentifier,
    @Visibility nvarchar(20) = NULL,
    @DelegateEntityID_Clear bit = 0,
    @DelegateEntityID uniqueidentifier = NULL,
    @DelegateRecordID_Clear bit = 0,
    @DelegateRecordID nvarchar(700) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Artifact]
            (
                [ID],
                [EnvironmentID],
                [Name],
                [Description],
                [TypeID],
                [Comments],
                [UserID],
                [Visibility],
                [DelegateEntityID],
                [DelegateRecordID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                CASE WHEN @EnvironmentID = '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE ISNULL(@EnvironmentID, 'F51358F3-9447-4176-B313-BF8025FD8D09') END,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @TypeID,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END,
                @UserID,
                ISNULL(@Visibility, 'Always'),
                CASE WHEN @DelegateEntityID_Clear = 1 THEN NULL ELSE ISNULL(@DelegateEntityID, NULL) END,
                CASE WHEN @DelegateRecordID_Clear = 1 THEN NULL ELSE ISNULL(@DelegateRecordID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Artifact]
            (
                [EnvironmentID],
                [Name],
                [Description],
                [TypeID],
                [Comments],
                [UserID],
                [Visibility],
                [DelegateEntityID],
                [DelegateRecordID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                CASE WHEN @EnvironmentID = '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE ISNULL(@EnvironmentID, 'F51358F3-9447-4176-B313-BF8025FD8D09') END,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @TypeID,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END,
                @UserID,
                ISNULL(@Visibility, 'Always'),
                CASE WHEN @DelegateEntityID_Clear = 1 THEN NULL ELSE ISNULL(@DelegateEntityID, NULL) END,
                CASE WHEN @DelegateRecordID_Clear = 1 THEN NULL ELSE ISNULL(@DelegateRecordID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwArtifacts] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateArtifact] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateArtifact] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateArtifact] FROM [cdp_UI]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArtifact] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Artifacts */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateArtifact] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateArtifact] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateArtifact] FROM [cdp_UI]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArtifact] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifacts
-- Item: spUpdateArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Artifact
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateArtifact]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateArtifact];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateArtifact]
    @ID uniqueidentifier,
    @EnvironmentID uniqueidentifier = NULL,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @TypeID uniqueidentifier = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL,
    @UserID uniqueidentifier = NULL,
    @Visibility nvarchar(20) = NULL,
    @DelegateEntityID_Clear bit = 0,
    @DelegateEntityID uniqueidentifier = NULL,
    @DelegateRecordID_Clear bit = 0,
    @DelegateRecordID nvarchar(700) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Artifact]
    SET
        [EnvironmentID] = ISNULL(@EnvironmentID, [EnvironmentID]),
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [TypeID] = ISNULL(@TypeID, [TypeID]),
        [Comments] = CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, [Comments]) END,
        [UserID] = ISNULL(@UserID, [UserID]),
        [Visibility] = ISNULL(@Visibility, [Visibility]),
        [DelegateEntityID] = CASE WHEN @DelegateEntityID_Clear = 1 THEN NULL ELSE ISNULL(@DelegateEntityID, [DelegateEntityID]) END,
        [DelegateRecordID] = CASE WHEN @DelegateRecordID_Clear = 1 THEN NULL ELSE ISNULL(@DelegateRecordID, [DelegateRecordID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwArtifacts] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwArtifacts]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateArtifact] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateArtifact] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateArtifact] FROM [cdp_UI]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArtifact] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Artifact table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateArtifact]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateArtifact];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateArtifact
ON [${flyway:defaultSchema}].[Artifact]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Artifact]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Artifact] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Artifacts */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateArtifact] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateArtifact] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateArtifact] FROM [cdp_UI]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArtifact] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifacts
-- Item: spDeleteArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Artifact
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteArtifact]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteArtifact];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteArtifact]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Artifact]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteArtifact] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteArtifact] FROM [cdp_UI]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArtifact] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Artifacts */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteArtifact] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteArtifact] FROM [cdp_UI]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArtifact] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* SQL text to update entity field related entity name field map for entity field ID CB1D12DC-250F-461A-ADEB-2EFD9BA4ACC2 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='CB1D12DC-250F-461A-ADEB-2EFD9BA4ACC2', @RelatedEntityNameFieldMap='LastModifiedByUser';

/* Base View SQL for MJ: Artifact Working States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Working States
-- Item: vwArtifactWorkingStates
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Artifact Working States
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ArtifactWorkingState
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwArtifactWorkingStates]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwArtifactWorkingStates];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwArtifactWorkingStates]
AS
SELECT
    a.*,
    MJArtifact_ArtifactID.[Name] AS [Artifact],
    MJUser_LastModifiedByUserID.[Name] AS [LastModifiedByUser]
FROM
    [${flyway:defaultSchema}].[ArtifactWorkingState] AS a
INNER JOIN
    [${flyway:defaultSchema}].[Artifact] AS MJArtifact_ArtifactID
  ON
    [a].[ArtifactID] = MJArtifact_ArtifactID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_LastModifiedByUserID
  ON
    [a].[LastModifiedByUserID] = MJUser_LastModifiedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwArtifactWorkingStates] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Artifact Working States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Working States
-- Item: Permissions for vwArtifactWorkingStates
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwArtifactWorkingStates] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Artifact Working States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Working States
-- Item: spCreateArtifactWorkingState
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ArtifactWorkingState
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateArtifactWorkingState]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateArtifactWorkingState];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateArtifactWorkingState]
    @ID uniqueidentifier = NULL,
    @ArtifactID uniqueidentifier,
    @YjsState_Clear bit = 0,
    @YjsState varbinary = NULL,
    @LastModifiedByUserID_Clear bit = 0,
    @LastModifiedByUserID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ArtifactWorkingState]
            (
                [ID],
                [ArtifactID],
                [YjsState],
                [LastModifiedByUserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ArtifactID,
                CASE WHEN @YjsState_Clear = 1 THEN NULL ELSE ISNULL(@YjsState, NULL) END,
                CASE WHEN @LastModifiedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@LastModifiedByUserID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ArtifactWorkingState]
            (
                [ArtifactID],
                [YjsState],
                [LastModifiedByUserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ArtifactID,
                CASE WHEN @YjsState_Clear = 1 THEN NULL ELSE ISNULL(@YjsState, NULL) END,
                CASE WHEN @LastModifiedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@LastModifiedByUserID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwArtifactWorkingStates] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArtifactWorkingState] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Artifact Working States */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArtifactWorkingState] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Artifact Working States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Working States
-- Item: spUpdateArtifactWorkingState
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ArtifactWorkingState
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateArtifactWorkingState]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateArtifactWorkingState];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateArtifactWorkingState]
    @ID uniqueidentifier,
    @ArtifactID uniqueidentifier = NULL,
    @YjsState_Clear bit = 0,
    @YjsState varbinary = NULL,
    @LastModifiedByUserID_Clear bit = 0,
    @LastModifiedByUserID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ArtifactWorkingState]
    SET
        [ArtifactID] = ISNULL(@ArtifactID, [ArtifactID]),
        [YjsState] = CASE WHEN @YjsState_Clear = 1 THEN NULL ELSE ISNULL(@YjsState, [YjsState]) END,
        [LastModifiedByUserID] = CASE WHEN @LastModifiedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@LastModifiedByUserID, [LastModifiedByUserID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwArtifactWorkingStates] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwArtifactWorkingStates]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArtifactWorkingState] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ArtifactWorkingState table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateArtifactWorkingState]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateArtifactWorkingState];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateArtifactWorkingState
ON [${flyway:defaultSchema}].[ArtifactWorkingState]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ArtifactWorkingState]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ArtifactWorkingState] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Artifact Working States */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArtifactWorkingState] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Artifact Working States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Working States
-- Item: spDeleteArtifactWorkingState
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ArtifactWorkingState
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteArtifactWorkingState]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteArtifactWorkingState];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteArtifactWorkingState]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ArtifactWorkingState]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArtifactWorkingState] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Artifact Working States */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArtifactWorkingState] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 3 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd74f5911-c832-4cec-86e1-7aa8d5273fda' OR (EntityID = 'F48D2341-8667-40BB-BCA8-87D7F80E16CD' AND Name = 'DelegateEntity')) BEGIN
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
            'd74f5911-c832-4cec-86e1-7aa8d5273fda',
            'F48D2341-8667-40BB-BCA8-87D7F80E16CD', -- Entity: MJ: Artifacts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F48D2341-8667-40BB-BCA8-87D7F80E16CD'),
            'DelegateEntity',
            'Delegate Entity',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd24c42b3-afc6-4425-b51e-31d623216f74' OR (EntityID = '0BA6990D-DC4F-408E-A748-8F64B3039533' AND Name = 'Artifact')) BEGIN
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
            'd24c42b3-afc6-4425-b51e-31d623216f74',
            '0BA6990D-DC4F-408E-A748-8F64B3039533', -- Entity: MJ: Artifact Working States
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0BA6990D-DC4F-408E-A748-8F64B3039533'),
            'Artifact',
            'Artifact',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9bd401cc-4834-436c-8f89-354990d4d3d5' OR (EntityID = '0BA6990D-DC4F-408E-A748-8F64B3039533' AND Name = 'LastModifiedByUser')) BEGIN
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
            '9bd401cc-4834-436c-8f89-354990d4d3d5',
            '0BA6990D-DC4F-408E-A748-8F64B3039533', -- Entity: MJ: Artifact Working States
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0BA6990D-DC4F-408E-A748-8F64B3039533'),
            'LastModifiedByUser',
            'Last Modified By User',
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
               WHERE ID = '308DAB79-DDAF-4BBC-9562-275DA7A704EF'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D24C42B3-AFC6-4425-B51E-31D623216F74'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '9BD401CC-4834-436C-8F89-354990D4D3D5'
               AND AutoUpdateDefaultInView = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 0
            WHERE ID = '0BA6990D-DC4F-408E-A748-8F64B3039533'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set categories for 3 fields */

-- UPDATE Entity Field Category Info MJ: Artifacts.DelegateEntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Artifact Core',
   GeneratedFormSection = 'Category',
   DisplayName = 'Delegate Entity'
WHERE 
   ID = '1E659159-B093-4F1F-AEDC-51785178F448';

-- UPDATE Entity Field Category Info MJ: Artifacts.DelegateRecordID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Artifact Core',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F6A80ADC-8465-40D5-A2C6-8E654C28B9DF';

-- UPDATE Entity Field Category Info MJ: Artifacts.DelegateEntity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Artifact Core',
   GeneratedFormSection = 'Category',
   DisplayName = 'Delegate Entity Name'
WHERE 
   ID = 'D74F5911-C832-4CEC-86E1-7AA8D5273FDA';

/* Set categories for 8 fields */

-- UPDATE Entity Field Category Info MJ: Artifact Working States.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C376EDC3-3659-4E11-B6FA-089FF49126A9';

-- UPDATE Entity Field Category Info MJ: Artifact Working States.ArtifactID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Collaborative State',
   GeneratedFormSection = 'Category',
   DisplayName = 'Artifact'
WHERE 
   ID = 'A903956A-2F7D-44B1-890B-76DBAF8C0D96';

-- UPDATE Entity Field Category Info MJ: Artifact Working States.YjsState 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Collaborative State',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'C074034C-27E4-4798-86AB-64E7949FD967';

-- UPDATE Entity Field Category Info MJ: Artifact Working States.Artifact 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Collaborative State',
   GeneratedFormSection = 'Category',
   DisplayName = 'Artifact Name'
WHERE 
   ID = 'D24C42B3-AFC6-4425-B51E-31D623216F74';

-- UPDATE Entity Field Category Info MJ: Artifact Working States.LastModifiedByUserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Edit Tracking',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'CB1D12DC-250F-461A-ADEB-2EFD9BA4ACC2';

-- UPDATE Entity Field Category Info MJ: Artifact Working States.LastModifiedByUser 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Edit Tracking',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '9BD401CC-4834-436C-8F89-354990D4D3D5';

-- UPDATE Entity Field Category Info MJ: Artifact Working States.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '8973B966-FCE0-444D-B682-98BA77F46B6B';

-- UPDATE Entity Field Category Info MJ: Artifact Working States.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '308DAB79-DDAF-4BBC-9562-275DA7A704EF';

/* Set entity icon to fa fa-file-code */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-file-code', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '0BA6990D-DC4F-408E-A748-8F64B3039533';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '0BA6990D-DC4F-408E-A748-8F64B3039533' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('664fb408-317c-523a-b702-746cb73a4d79', '0BA6990D-DC4F-408E-A748-8F64B3039533', 'FieldCategoryInfo', '{
  "Collaborative State": {
    "description": "Live compacted Yjs CRDT binary state and associated artifact references",
    "icon": "fa fa-sync"
  },
  "Edit Tracking": {
    "description": "User audit details regarding the most recent session modifications",
    "icon": "fa fa-user-edit"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '0BA6990D-DC4F-408E-A748-8F64B3039533' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('32f54cca-dcad-553a-8b75-b1a614b9e049', '0BA6990D-DC4F-408E-A748-8F64B3039533', 'FieldCategoryIcons', '{
  "Collaborative State": "fa fa-sync",
  "Edit Tracking": "fa fa-user-edit",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '0BA6990D-DC4F-408E-A748-8F64B3039533';

