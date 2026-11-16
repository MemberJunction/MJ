-- =====================================================================================
-- Lists: refresh from a saved query, source fingerprints, and an auto-refresh routine
--
-- Query.DefinitionFingerprint and UserView.DefinitionFingerprint hold the hash of each
-- source's current definition, stamped on every save by the entity's server subclass.
-- A list stores the fingerprint it was linked against (List.SourceFingerprint). Before a
-- refresh, the two are compared. On a mismatch, nothing is applied and the owner is asked
-- to review the change.
--
-- A list can now be linked to a saved query (SourceQueryID, with its parameter values and
-- the result column that holds the entity's primary key) as well as to a view, never both.
--
-- When the owner ticks Refresh automatically (List.AutoRefresh), the list's server subclass
-- creates a User Routine that runs "Refresh List From Source" and stores it in
-- List.RefreshRoutineID.
-- =====================================================================================

ALTER TABLE ${flyway:defaultSchema}.Query
ADD DefinitionFingerprint NVARCHAR(100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL;
GO

ALTER TABLE ${flyway:defaultSchema}.UserView
ADD DefinitionFingerprint NVARCHAR(100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL;
GO

ALTER TABLE ${flyway:defaultSchema}.List ADD
    SourceQueryID UNIQUEIDENTIFIER NULL,
    SourceQueryParameters NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    SourceQueryKeyField NVARCHAR(255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    SourceFingerprint NVARCHAR(100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    AutoRefresh BIT NOT NULL
        CONSTRAINT DF_List_AutoRefresh DEFAULT (0),
    RefreshRoutineID UNIQUEIDENTIFIER NULL;
GO

-- Foreign keys and the one-source rule, in a separate batch so they can see the new columns.
ALTER TABLE ${flyway:defaultSchema}.List
    ADD CONSTRAINT FK_List_SourceQuery
        FOREIGN KEY (SourceQueryID)
        REFERENCES ${flyway:defaultSchema}.Query(ID);
GO

ALTER TABLE ${flyway:defaultSchema}.List
    ADD CONSTRAINT FK_List_RefreshRoutine
        FOREIGN KEY (RefreshRoutineID)
        REFERENCES ${flyway:defaultSchema}.UserRoutine(ID);
GO

ALTER TABLE ${flyway:defaultSchema}.List
    ADD CONSTRAINT CK_List_SingleSource
        CHECK (SourceViewID IS NULL OR SourceQueryID IS NULL);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Hash of this query''s current definition: its SQL, template flag, external source, dialect SQL and parameter contract. Stamped on every save. A list linked to this query compares it with List.SourceFingerprint before each refresh. NULL until the query is next saved or checked.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Query',
    @level2type = N'COLUMN', @level2name = N'DefinitionFingerprint';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Hash of this view''s current definition: its entity, filters and alternate base view. Stamped on every save. A list linked to this view compares it with List.SourceFingerprint before each refresh. NULL until the view is next saved or checked.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserView',
    @level2type = N'COLUMN', @level2name = N'DefinitionFingerprint';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional ID of the saved query this list is refreshed from. A list has at most one source: this or SourceViewID.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'List',
    @level2type = N'COLUMN', @level2name = N'SourceQueryID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON object of the parameter values the source query runs with, keyed by parameter name. NULL when the query takes no parameters.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'List',
    @level2type = N'COLUMN', @level2name = N'SourceQueryParameters';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Name of the source query''s result column that holds the primary key of the list''s entity. Required when SourceQueryID is set.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'List',
    @level2type = N'COLUMN', @level2name = N'SourceQueryKeyField';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Definition fingerprint of the source query or view at the time the list was linked, or when the owner last approved a change to the source. A refresh compares it with the source''s current DefinitionFingerprint and stops when they differ. NULL until the next successful refresh fills it.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'List',
    @level2type = N'COLUMN', @level2name = N'SourceFingerprint';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When 1, the list refreshes from its source on a schedule through the User Routine in RefreshRoutineID. When 0 (default), it refreshes only when someone runs a refresh.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'List',
    @level2type = N'COLUMN', @level2name = N'AutoRefresh';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The User Routine that refreshes this list on a schedule. Created when AutoRefresh is first turned on, and disabled (not deleted) when it is turned off, so its run history stays.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'List',
    @level2type = N'COLUMN', @level2name = N'RefreshRoutineID';
GO


















































/* =====================================================================================
   CODEGEN OUTPUT — everything below this banner was generated by the MemberJunction
   CodeGen tool (mj codegen) against a database built from migrations alone, then
   appended here. It contains the EntityField INSERTs for Query.DefinitionFingerprint,
   UserView.DefinitionFingerprint and the six new List columns, the foreign-key indexes,
   the regenerated vwLists and vwQueries views and their permissions, and the
   spCreate / spUpdate / spDelete procedures for List, Query and UserView with their grants.

   Do NOT edit it by hand. If the hand-written DDL above changes, re-run CodeGen and
   replace this entire section.
   ===================================================================================== */
/* SQL text to insert 8 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a9062f72-7c0c-4c1a-9d80-de1e3bd7c905' OR (EntityID = 'E4238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'DefinitionFingerprint')) BEGIN
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
            'a9062f72-7c0c-4c1a-9d80-de1e3bd7c905',
            'E4238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: User Views
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E4238F34-2837-EF11-86D4-6045BDEE16E6'),
            'DefinitionFingerprint',
            'Definition Fingerprint',
            'Hash of this view''s current definition: its entity, filters and alternate base view. Stamped on every save. A list linked to this view compares it with List.SourceFingerprint before each refresh. NULL until the view is next saved or checked.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'daf4ae68-84d8-40cc-9cf9-92bf0b02091b' OR (EntityID = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'SourceQueryID')) BEGIN
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
            'daf4ae68-84d8-40cc-9cf9-92bf0b02091b',
            'EE238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Lists
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'EE238F34-2837-EF11-86D4-6045BDEE16E6'),
            'SourceQueryID',
            'Source Query ID',
            'Optional ID of the saved query this list is refreshed from. A list has at most one source: this or SourceViewID.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c5bd134f-1dee-476c-aa1d-1909f5e2b0e1' OR (EntityID = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'SourceQueryParameters')) BEGIN
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
            'c5bd134f-1dee-476c-aa1d-1909f5e2b0e1',
            'EE238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Lists
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'EE238F34-2837-EF11-86D4-6045BDEE16E6'),
            'SourceQueryParameters',
            'Source Query Parameters',
            'JSON object of the parameter values the source query runs with, keyed by parameter name. NULL when the query takes no parameters.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3d493e7a-9714-4410-b994-ecafda3a63fa' OR (EntityID = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'SourceQueryKeyField')) BEGIN
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
            '3d493e7a-9714-4410-b994-ecafda3a63fa',
            'EE238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Lists
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'EE238F34-2837-EF11-86D4-6045BDEE16E6'),
            'SourceQueryKeyField',
            'Source Query Key Field',
            'Name of the source query''s result column that holds the primary key of the list''s entity. Required when SourceQueryID is set.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5d9e2ef4-7f87-4b5c-b994-8ce16245f821' OR (EntityID = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'SourceFingerprint')) BEGIN
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
            '5d9e2ef4-7f87-4b5c-b994-8ce16245f821',
            'EE238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Lists
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'EE238F34-2837-EF11-86D4-6045BDEE16E6'),
            'SourceFingerprint',
            'Source Fingerprint',
            'Definition fingerprint of the source query or view at the time the list was linked, or when the owner last approved a change to the source. A refresh compares it with the source''s current DefinitionFingerprint and stops when they differ. NULL until the next successful refresh fills it.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1bc9d307-dd54-440f-98b4-0b8e12e47f6c' OR (EntityID = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'AutoRefresh')) BEGIN
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
            '1bc9d307-dd54-440f-98b4-0b8e12e47f6c',
            'EE238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Lists
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'EE238F34-2837-EF11-86D4-6045BDEE16E6'),
            'AutoRefresh',
            'Auto Refresh',
            'When 1, the list refreshes from its source on a schedule through the User Routine in RefreshRoutineID. When 0 (default), it refreshes only when someone runs a refresh.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '399f145c-b667-4a95-8275-2fdbd5a395e1' OR (EntityID = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RefreshRoutineID')) BEGIN
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
            '399f145c-b667-4a95-8275-2fdbd5a395e1',
            'EE238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Lists
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'EE238F34-2837-EF11-86D4-6045BDEE16E6'),
            'RefreshRoutineID',
            'Refresh Routine ID',
            'The User Routine that refreshes this list on a schedule. Created when AutoRefresh is first turned on, and disabled (not deleted) when it is turned off, so its run history stays.',
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
            'D6CA6018-D288-4F79-B6A9-168C75C3363B',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dccf5d20-df77-447e-aabf-b52299952815' OR (EntityID = '1B248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'DefinitionFingerprint')) BEGIN
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
            'dccf5d20-df77-447e-aabf-b52299952815',
            '1B248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Queries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1B248F34-2837-EF11-86D4-6045BDEE16E6'),
            'DefinitionFingerprint',
            'Definition Fingerprint',
            'Hash of this query''s current definition: its SQL, template flag, external source, dialect SQL and parameter contract. Stamped on every save. A list linked to this query compares it with List.SourceFingerprint before each refresh. NULL until the query is next saved or checked.',
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


/* Create Entity Relationship: MJ: User Routines -> MJ: Lists (One To Many via RefreshRoutineID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '92e1cbbd-c328-412e-9ec9-1230716d7d2f' OR ([EntityID] = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND [RelatedEntityID] = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityJoinField] = 'RefreshRoutineID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('92e1cbbd-c328-412e-9ec9-1230716d7d2f', 'D6CA6018-D288-4F79-B6A9-168C75C3363B', 'EE238F34-2837-EF11-86D4-6045BDEE16E6', 'RefreshRoutineID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Queries -> MJ: Lists (One To Many via SourceQueryID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '308ceb82-76be-4db5-84cd-d87408c8b8c1' OR ([EntityID] = '1B248F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityJoinField] = 'SourceQueryID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('308ceb82-76be-4db5-84cd-d87408c8b8c1', '1B248F34-2837-EF11-86D4-6045BDEE16E6', 'EE238F34-2837-EF11-86D4-6045BDEE16E6', 'SourceQueryID', 'One To Many', 1, 1, 10, GETUTCDATE(), GETUTCDATE())
   END;

/* Update attributes on "MJ: Conversations" from additionalSchemaInfo */
UPDATE [${flyway:defaultSchema}].[Entity]
                              SET [__mj_UpdatedAt] = GETUTCDATE(), [SubtypeSelector] = '{"Path": "TypeID.ExtensionEntity", "UseForLoadedRecords": true, "AutoEnsureOnSave": true, "Driver": {"Path": "TypeID.DriverClass", "BaseClass": "ConversationTypeDriver"}}'
                              WHERE [ID] = '13248F34-2837-EF11-86D4-6045BDEE16E6';

/* Update attributes on "MJ: Comments" from additionalSchemaInfo */
UPDATE [${flyway:defaultSchema}].[Entity]
                              SET [__mj_UpdatedAt] = GETUTCDATE(), [SubtypeSelector] = '{"Path": "CommentTypeID.ExtensionEntity", "UseForLoadedRecords": true, "AutoEnsureOnSave": true, "Driver": {"Path": "CommentTypeID.DriverClass", "BaseClass": "CommentTypeDriver"}, "UIDriver": {"Path": "CommentTypeID.UIDriverClass"}}'
                              WHERE [ID] = 'B46E1990-487D-45D6-B91E-A77D58ED0229';

/* SQL text to update entity field related entity name field map for entity field ID DAF4AE68-84D8-40CC-9CF9-92BF0B02091B */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='DAF4AE68-84D8-40CC-9CF9-92BF0B02091B', @RelatedEntityNameFieldMap='SourceQuery';

/* SQL text to update entity field related entity name field map for entity field ID 399F145C-B667-4A95-8275-2FDBD5A395E1 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='399F145C-B667-4A95-8275-2FDBD5A395E1', @RelatedEntityNameFieldMap='RefreshRoutine';

/* Index for Foreign Keys for List */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Lists
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table List
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_List_EntityID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[List]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[List]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'EntityID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_List_EntityID ON [${flyway:defaultSchema}].[List] ([EntityID]);

-- Index for foreign key UserID in table List
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_List_UserID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[List]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[List]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'UserID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_List_UserID ON [${flyway:defaultSchema}].[List] ([UserID]);

-- Index for foreign key CategoryID in table List
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_List_CategoryID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[List]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[List]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'CategoryID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_List_CategoryID ON [${flyway:defaultSchema}].[List] ([CategoryID]);

-- Index for foreign key CompanyIntegrationID in table List
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_List_CompanyIntegrationID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[List]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[List]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'CompanyIntegrationID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_List_CompanyIntegrationID ON [${flyway:defaultSchema}].[List] ([CompanyIntegrationID]);

-- Index for foreign key SourceViewID in table List
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_List_SourceViewID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[List]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[List]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'SourceViewID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_List_SourceViewID ON [${flyway:defaultSchema}].[List] ([SourceViewID]);

-- Index for foreign key LastRefreshedByUserID in table List
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_List_LastRefreshedByUserID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[List]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[List]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'LastRefreshedByUserID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_List_LastRefreshedByUserID ON [${flyway:defaultSchema}].[List] ([LastRefreshedByUserID]);

-- Index for foreign key SourceQueryID in table List
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_List_SourceQueryID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[List]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[List]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'SourceQueryID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_List_SourceQueryID ON [${flyway:defaultSchema}].[List] ([SourceQueryID]);

-- Index for foreign key RefreshRoutineID in table List
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_List_RefreshRoutineID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[List]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[List]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'RefreshRoutineID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_List_RefreshRoutineID ON [${flyway:defaultSchema}].[List] ([RefreshRoutineID]);

/* Base View SQL for MJ: Lists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Lists
-- Item: vwLists
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Lists
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  List
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwLists]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwLists];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwLists]
AS
SELECT
    l.*,
    MJEntity_EntityID.[Name] AS [Entity],
    MJUser_UserID.[Name] AS [User],
    MJListCategory_CategoryID.[Name] AS [Category],
    MJCompanyIntegration_CompanyIntegrationID.[Name] AS [CompanyIntegration],
    MJUserView_SourceViewID.[Name] AS [SourceView],
    MJUser_LastRefreshedByUserID.[Name] AS [LastRefreshedByUser],
    MJQuery_SourceQueryID.[Name] AS [SourceQuery],
    MJUserRoutine_RefreshRoutineID.[Name] AS [RefreshRoutine]
FROM
    [${flyway:defaultSchema}].[List] AS l
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_EntityID
  ON
    [l].[EntityID] = MJEntity_EntityID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [l].[UserID] = MJUser_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ListCategory] AS MJListCategory_CategoryID
  ON
    [l].[CategoryID] = MJListCategory_CategoryID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[CompanyIntegration] AS MJCompanyIntegration_CompanyIntegrationID
  ON
    [l].[CompanyIntegrationID] = MJCompanyIntegration_CompanyIntegrationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[UserView] AS MJUserView_SourceViewID
  ON
    [l].[SourceViewID] = MJUserView_SourceViewID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_LastRefreshedByUserID
  ON
    [l].[LastRefreshedByUserID] = MJUser_LastRefreshedByUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Query] AS MJQuery_SourceQueryID
  ON
    [l].[SourceQueryID] = MJQuery_SourceQueryID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[UserRoutine] AS MJUserRoutine_RefreshRoutineID
  ON
    [l].[RefreshRoutineID] = MJUserRoutine_RefreshRoutineID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwLists] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwLists] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwLists] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwLists] TO [cdp_Integration], [cdp_Developer], [cdp_UI];

/* Base View Permissions SQL for MJ: Lists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Lists
-- Item: Permissions for vwLists
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwLists] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwLists] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwLists] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwLists] TO [cdp_Integration], [cdp_Developer], [cdp_UI];

/* spCreate SQL for MJ: Lists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Lists
-- Item: spCreateList
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR List
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateList]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateList];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateList]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @EntityID uniqueidentifier,
    @UserID uniqueidentifier,
    @CategoryID_Clear bit = 0,
    @CategoryID uniqueidentifier = NULL,
    @ExternalSystemRecordID_Clear bit = 0,
    @ExternalSystemRecordID nvarchar(100) = NULL,
    @CompanyIntegrationID_Clear bit = 0,
    @CompanyIntegrationID uniqueidentifier = NULL,
    @SourceViewID_Clear bit = 0,
    @SourceViewID uniqueidentifier = NULL,
    @SourceFilterSnapshot_Clear bit = 0,
    @SourceFilterSnapshot nvarchar(MAX) = NULL,
    @LastRefreshedAt_Clear bit = 0,
    @LastRefreshedAt datetimeoffset = NULL,
    @LastRefreshedByUserID_Clear bit = 0,
    @LastRefreshedByUserID uniqueidentifier = NULL,
    @RefreshMode nvarchar(20) = NULL,
    @UseSnapshot bit = NULL,
    @SourceQueryID_Clear bit = 0,
    @SourceQueryID uniqueidentifier = NULL,
    @SourceQueryParameters_Clear bit = 0,
    @SourceQueryParameters nvarchar(MAX) = NULL,
    @SourceQueryKeyField_Clear bit = 0,
    @SourceQueryKeyField nvarchar(255) = NULL,
    @SourceFingerprint_Clear bit = 0,
    @SourceFingerprint nvarchar(100) = NULL,
    @AutoRefresh bit = NULL,
    @RefreshRoutineID_Clear bit = 0,
    @RefreshRoutineID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[List]
            (
                [ID],
                [Name],
                [Description],
                [EntityID],
                [UserID],
                [CategoryID],
                [ExternalSystemRecordID],
                [CompanyIntegrationID],
                [SourceViewID],
                [SourceFilterSnapshot],
                [LastRefreshedAt],
                [LastRefreshedByUserID],
                [RefreshMode],
                [UseSnapshot],
                [SourceQueryID],
                [SourceQueryParameters],
                [SourceQueryKeyField],
                [SourceFingerprint],
                [AutoRefresh],
                [RefreshRoutineID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @EntityID,
                @UserID,
                CASE WHEN @CategoryID_Clear = 1 THEN NULL ELSE ISNULL(@CategoryID, NULL) END,
                CASE WHEN @ExternalSystemRecordID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalSystemRecordID, NULL) END,
                CASE WHEN @CompanyIntegrationID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyIntegrationID, NULL) END,
                CASE WHEN @SourceViewID_Clear = 1 THEN NULL ELSE ISNULL(@SourceViewID, NULL) END,
                CASE WHEN @SourceFilterSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@SourceFilterSnapshot, NULL) END,
                CASE WHEN @LastRefreshedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastRefreshedAt, NULL) END,
                CASE WHEN @LastRefreshedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@LastRefreshedByUserID, NULL) END,
                ISNULL(@RefreshMode, 'Additive'),
                ISNULL(@UseSnapshot, 0),
                CASE WHEN @SourceQueryID_Clear = 1 THEN NULL ELSE ISNULL(@SourceQueryID, NULL) END,
                CASE WHEN @SourceQueryParameters_Clear = 1 THEN NULL ELSE ISNULL(@SourceQueryParameters, NULL) END,
                CASE WHEN @SourceQueryKeyField_Clear = 1 THEN NULL ELSE ISNULL(@SourceQueryKeyField, NULL) END,
                CASE WHEN @SourceFingerprint_Clear = 1 THEN NULL ELSE ISNULL(@SourceFingerprint, NULL) END,
                ISNULL(@AutoRefresh, 0),
                CASE WHEN @RefreshRoutineID_Clear = 1 THEN NULL ELSE ISNULL(@RefreshRoutineID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[List]
            (
                [Name],
                [Description],
                [EntityID],
                [UserID],
                [CategoryID],
                [ExternalSystemRecordID],
                [CompanyIntegrationID],
                [SourceViewID],
                [SourceFilterSnapshot],
                [LastRefreshedAt],
                [LastRefreshedByUserID],
                [RefreshMode],
                [UseSnapshot],
                [SourceQueryID],
                [SourceQueryParameters],
                [SourceQueryKeyField],
                [SourceFingerprint],
                [AutoRefresh],
                [RefreshRoutineID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @EntityID,
                @UserID,
                CASE WHEN @CategoryID_Clear = 1 THEN NULL ELSE ISNULL(@CategoryID, NULL) END,
                CASE WHEN @ExternalSystemRecordID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalSystemRecordID, NULL) END,
                CASE WHEN @CompanyIntegrationID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyIntegrationID, NULL) END,
                CASE WHEN @SourceViewID_Clear = 1 THEN NULL ELSE ISNULL(@SourceViewID, NULL) END,
                CASE WHEN @SourceFilterSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@SourceFilterSnapshot, NULL) END,
                CASE WHEN @LastRefreshedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastRefreshedAt, NULL) END,
                CASE WHEN @LastRefreshedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@LastRefreshedByUserID, NULL) END,
                ISNULL(@RefreshMode, 'Additive'),
                ISNULL(@UseSnapshot, 0),
                CASE WHEN @SourceQueryID_Clear = 1 THEN NULL ELSE ISNULL(@SourceQueryID, NULL) END,
                CASE WHEN @SourceQueryParameters_Clear = 1 THEN NULL ELSE ISNULL(@SourceQueryParameters, NULL) END,
                CASE WHEN @SourceQueryKeyField_Clear = 1 THEN NULL ELSE ISNULL(@SourceQueryKeyField, NULL) END,
                CASE WHEN @SourceFingerprint_Clear = 1 THEN NULL ELSE ISNULL(@SourceFingerprint, NULL) END,
                ISNULL(@AutoRefresh, 0),
                CASE WHEN @RefreshRoutineID_Clear = 1 THEN NULL ELSE ISNULL(@RefreshRoutineID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwLists] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateList] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateList] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateList] FROM [cdp_UI]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateList] TO [cdp_Integration], [cdp_Developer], [cdp_UI];

/* spCreate Permissions for MJ: Lists */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateList] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateList] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateList] FROM [cdp_UI]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateList] TO [cdp_Integration], [cdp_Developer], [cdp_UI];

/* spUpdate SQL for MJ: Lists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Lists
-- Item: spUpdateList
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR List
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateList]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateList];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateList]
    @ID uniqueidentifier,
    @Name nvarchar(100) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @EntityID uniqueidentifier = NULL,
    @UserID uniqueidentifier = NULL,
    @CategoryID_Clear bit = 0,
    @CategoryID uniqueidentifier = NULL,
    @ExternalSystemRecordID_Clear bit = 0,
    @ExternalSystemRecordID nvarchar(100) = NULL,
    @CompanyIntegrationID_Clear bit = 0,
    @CompanyIntegrationID uniqueidentifier = NULL,
    @SourceViewID_Clear bit = 0,
    @SourceViewID uniqueidentifier = NULL,
    @SourceFilterSnapshot_Clear bit = 0,
    @SourceFilterSnapshot nvarchar(MAX) = NULL,
    @LastRefreshedAt_Clear bit = 0,
    @LastRefreshedAt datetimeoffset = NULL,
    @LastRefreshedByUserID_Clear bit = 0,
    @LastRefreshedByUserID uniqueidentifier = NULL,
    @RefreshMode nvarchar(20) = NULL,
    @UseSnapshot bit = NULL,
    @SourceQueryID_Clear bit = 0,
    @SourceQueryID uniqueidentifier = NULL,
    @SourceQueryParameters_Clear bit = 0,
    @SourceQueryParameters nvarchar(MAX) = NULL,
    @SourceQueryKeyField_Clear bit = 0,
    @SourceQueryKeyField nvarchar(255) = NULL,
    @SourceFingerprint_Clear bit = 0,
    @SourceFingerprint nvarchar(100) = NULL,
    @AutoRefresh bit = NULL,
    @RefreshRoutineID_Clear bit = 0,
    @RefreshRoutineID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[List]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [EntityID] = ISNULL(@EntityID, [EntityID]),
        [UserID] = ISNULL(@UserID, [UserID]),
        [CategoryID] = CASE WHEN @CategoryID_Clear = 1 THEN NULL ELSE ISNULL(@CategoryID, [CategoryID]) END,
        [ExternalSystemRecordID] = CASE WHEN @ExternalSystemRecordID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalSystemRecordID, [ExternalSystemRecordID]) END,
        [CompanyIntegrationID] = CASE WHEN @CompanyIntegrationID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyIntegrationID, [CompanyIntegrationID]) END,
        [SourceViewID] = CASE WHEN @SourceViewID_Clear = 1 THEN NULL ELSE ISNULL(@SourceViewID, [SourceViewID]) END,
        [SourceFilterSnapshot] = CASE WHEN @SourceFilterSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@SourceFilterSnapshot, [SourceFilterSnapshot]) END,
        [LastRefreshedAt] = CASE WHEN @LastRefreshedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastRefreshedAt, [LastRefreshedAt]) END,
        [LastRefreshedByUserID] = CASE WHEN @LastRefreshedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@LastRefreshedByUserID, [LastRefreshedByUserID]) END,
        [RefreshMode] = ISNULL(@RefreshMode, [RefreshMode]),
        [UseSnapshot] = ISNULL(@UseSnapshot, [UseSnapshot]),
        [SourceQueryID] = CASE WHEN @SourceQueryID_Clear = 1 THEN NULL ELSE ISNULL(@SourceQueryID, [SourceQueryID]) END,
        [SourceQueryParameters] = CASE WHEN @SourceQueryParameters_Clear = 1 THEN NULL ELSE ISNULL(@SourceQueryParameters, [SourceQueryParameters]) END,
        [SourceQueryKeyField] = CASE WHEN @SourceQueryKeyField_Clear = 1 THEN NULL ELSE ISNULL(@SourceQueryKeyField, [SourceQueryKeyField]) END,
        [SourceFingerprint] = CASE WHEN @SourceFingerprint_Clear = 1 THEN NULL ELSE ISNULL(@SourceFingerprint, [SourceFingerprint]) END,
        [AutoRefresh] = ISNULL(@AutoRefresh, [AutoRefresh]),
        [RefreshRoutineID] = CASE WHEN @RefreshRoutineID_Clear = 1 THEN NULL ELSE ISNULL(@RefreshRoutineID, [RefreshRoutineID]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwLists] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwLists]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateList] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateList] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateList] FROM [cdp_UI]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateList] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the List table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateList]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateList];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateList
ON [${flyway:defaultSchema}].[List]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[List]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[List] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

/* spUpdate Permissions for MJ: Lists */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateList] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateList] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateList] FROM [cdp_UI]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateList] TO [cdp_Integration], [cdp_Developer], [cdp_UI];

/* spDelete SQL for MJ: Lists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Lists
-- Item: spDeleteList
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR List
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteList]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteList];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteList]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[List]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteList] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteList] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteList] FROM [cdp_UI]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteList] TO [cdp_Integration], [cdp_Developer], [cdp_UI];

/* spDelete Permissions for MJ: Lists */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteList] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteList] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteList] FROM [cdp_UI]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteList] TO [cdp_Integration], [cdp_Developer], [cdp_UI];

/* Index for Foreign Keys for UserView */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Views
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserID in table UserView
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserView_UserID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserView]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserView]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'UserID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserView_UserID ON [${flyway:defaultSchema}].[UserView] ([UserID]);

-- Index for foreign key EntityID in table UserView
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserView_EntityID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserView]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserView]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'EntityID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserView_EntityID ON [${flyway:defaultSchema}].[UserView] ([EntityID]);

-- Index for foreign key CategoryID in table UserView
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserView_CategoryID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserView]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserView]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'CategoryID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserView_CategoryID ON [${flyway:defaultSchema}].[UserView] ([CategoryID]);

-- Index for foreign key ViewTypeID in table UserView
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserView_ViewTypeID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserView]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserView]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'ViewTypeID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserView_ViewTypeID ON [${flyway:defaultSchema}].[UserView] ([ViewTypeID]);

-- Index for foreign key ApprovedByUserID in table UserView
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserView_ApprovedByUserID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserView]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserView]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'ApprovedByUserID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserView_ApprovedByUserID ON [${flyway:defaultSchema}].[UserView] ([ApprovedByUserID]);

/* Base View Permissions SQL for MJ: User Views */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Views
-- Item: Permissions for vwUserViews
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwUserViews] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwUserViews] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwUserViews] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwUserViews] TO [cdp_Integration], [cdp_Developer], [cdp_UI];

/* spCreate SQL for MJ: User Views */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Views
-- Item: spCreateUserView
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR UserView
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateUserView]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateUserView];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateUserView]
    @ID uniqueidentifier = NULL,
    @UserID uniqueidentifier,
    @EntityID uniqueidentifier,
    @Name nvarchar(100),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @CategoryID_Clear bit = 0,
    @CategoryID uniqueidentifier = NULL,
    @IsShared bit = NULL,
    @IsDefault bit = NULL,
    @GridState_Clear bit = 0,
    @GridState nvarchar(MAX) = NULL,
    @FilterState_Clear bit = 0,
    @FilterState nvarchar(MAX) = NULL,
    @CustomFilterState bit = NULL,
    @SmartFilterEnabled bit = NULL,
    @SmartFilterPrompt_Clear bit = 0,
    @SmartFilterPrompt nvarchar(MAX) = NULL,
    @SmartFilterWhereClause_Clear bit = 0,
    @SmartFilterWhereClause nvarchar(MAX) = NULL,
    @SmartFilterExplanation_Clear bit = 0,
    @SmartFilterExplanation nvarchar(MAX) = NULL,
    @WhereClause_Clear bit = 0,
    @WhereClause nvarchar(MAX) = NULL,
    @CustomWhereClause bit = NULL,
    @SortState_Clear bit = 0,
    @SortState nvarchar(MAX) = NULL,
    @Thumbnail_Clear bit = 0,
    @Thumbnail nvarchar(MAX) = NULL,
    @CardState_Clear bit = 0,
    @CardState nvarchar(MAX) = NULL,
    @DisplayState_Clear bit = 0,
    @DisplayState nvarchar(MAX) = NULL,
    @ViewTypeID_Clear bit = 0,
    @ViewTypeID uniqueidentifier = NULL,
    @Properties_Clear bit = 0,
    @Properties nvarchar(MAX) = NULL,
    @ApprovalStatus nvarchar(20) = NULL,
    @ApprovalComments_Clear bit = 0,
    @ApprovalComments nvarchar(MAX) = NULL,
    @ApprovedByUserID_Clear bit = 0,
    @ApprovedByUserID uniqueidentifier = NULL,
    @ApprovedAt_Clear bit = 0,
    @ApprovedAt datetimeoffset = NULL,
    @ApprovedFingerprint_Clear bit = 0,
    @ApprovedFingerprint nvarchar(100) = NULL,
    @DefinitionFingerprint_Clear bit = 0,
    @DefinitionFingerprint nvarchar(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[UserView]
            (
                [ID],
                [UserID],
                [EntityID],
                [Name],
                [Description],
                [CategoryID],
                [IsShared],
                [IsDefault],
                [GridState],
                [FilterState],
                [CustomFilterState],
                [SmartFilterEnabled],
                [SmartFilterPrompt],
                [SmartFilterWhereClause],
                [SmartFilterExplanation],
                [WhereClause],
                [CustomWhereClause],
                [SortState],
                [Thumbnail],
                [CardState],
                [DisplayState],
                [ViewTypeID],
                [Properties],
                [ApprovalStatus],
                [ApprovalComments],
                [ApprovedByUserID],
                [ApprovedAt],
                [ApprovedFingerprint],
                [DefinitionFingerprint]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @UserID,
                @EntityID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @CategoryID_Clear = 1 THEN NULL ELSE ISNULL(@CategoryID, NULL) END,
                ISNULL(@IsShared, 0),
                ISNULL(@IsDefault, 0),
                CASE WHEN @GridState_Clear = 1 THEN NULL ELSE ISNULL(@GridState, NULL) END,
                CASE WHEN @FilterState_Clear = 1 THEN NULL ELSE ISNULL(@FilterState, NULL) END,
                ISNULL(@CustomFilterState, 0),
                ISNULL(@SmartFilterEnabled, 0),
                CASE WHEN @SmartFilterPrompt_Clear = 1 THEN NULL ELSE ISNULL(@SmartFilterPrompt, NULL) END,
                CASE WHEN @SmartFilterWhereClause_Clear = 1 THEN NULL ELSE ISNULL(@SmartFilterWhereClause, NULL) END,
                CASE WHEN @SmartFilterExplanation_Clear = 1 THEN NULL ELSE ISNULL(@SmartFilterExplanation, NULL) END,
                CASE WHEN @WhereClause_Clear = 1 THEN NULL ELSE ISNULL(@WhereClause, NULL) END,
                ISNULL(@CustomWhereClause, 0),
                CASE WHEN @SortState_Clear = 1 THEN NULL ELSE ISNULL(@SortState, NULL) END,
                CASE WHEN @Thumbnail_Clear = 1 THEN NULL ELSE ISNULL(@Thumbnail, NULL) END,
                CASE WHEN @CardState_Clear = 1 THEN NULL ELSE ISNULL(@CardState, NULL) END,
                CASE WHEN @DisplayState_Clear = 1 THEN NULL ELSE ISNULL(@DisplayState, NULL) END,
                CASE WHEN @ViewTypeID_Clear = 1 THEN NULL ELSE ISNULL(@ViewTypeID, NULL) END,
                CASE WHEN @Properties_Clear = 1 THEN NULL ELSE ISNULL(@Properties, NULL) END,
                ISNULL(@ApprovalStatus, 'Pending'),
                CASE WHEN @ApprovalComments_Clear = 1 THEN NULL ELSE ISNULL(@ApprovalComments, NULL) END,
                CASE WHEN @ApprovedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedByUserID, NULL) END,
                CASE WHEN @ApprovedAt_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedAt, NULL) END,
                CASE WHEN @ApprovedFingerprint_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedFingerprint, NULL) END,
                CASE WHEN @DefinitionFingerprint_Clear = 1 THEN NULL ELSE ISNULL(@DefinitionFingerprint, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[UserView]
            (
                [UserID],
                [EntityID],
                [Name],
                [Description],
                [CategoryID],
                [IsShared],
                [IsDefault],
                [GridState],
                [FilterState],
                [CustomFilterState],
                [SmartFilterEnabled],
                [SmartFilterPrompt],
                [SmartFilterWhereClause],
                [SmartFilterExplanation],
                [WhereClause],
                [CustomWhereClause],
                [SortState],
                [Thumbnail],
                [CardState],
                [DisplayState],
                [ViewTypeID],
                [Properties],
                [ApprovalStatus],
                [ApprovalComments],
                [ApprovedByUserID],
                [ApprovedAt],
                [ApprovedFingerprint],
                [DefinitionFingerprint]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @UserID,
                @EntityID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @CategoryID_Clear = 1 THEN NULL ELSE ISNULL(@CategoryID, NULL) END,
                ISNULL(@IsShared, 0),
                ISNULL(@IsDefault, 0),
                CASE WHEN @GridState_Clear = 1 THEN NULL ELSE ISNULL(@GridState, NULL) END,
                CASE WHEN @FilterState_Clear = 1 THEN NULL ELSE ISNULL(@FilterState, NULL) END,
                ISNULL(@CustomFilterState, 0),
                ISNULL(@SmartFilterEnabled, 0),
                CASE WHEN @SmartFilterPrompt_Clear = 1 THEN NULL ELSE ISNULL(@SmartFilterPrompt, NULL) END,
                CASE WHEN @SmartFilterWhereClause_Clear = 1 THEN NULL ELSE ISNULL(@SmartFilterWhereClause, NULL) END,
                CASE WHEN @SmartFilterExplanation_Clear = 1 THEN NULL ELSE ISNULL(@SmartFilterExplanation, NULL) END,
                CASE WHEN @WhereClause_Clear = 1 THEN NULL ELSE ISNULL(@WhereClause, NULL) END,
                ISNULL(@CustomWhereClause, 0),
                CASE WHEN @SortState_Clear = 1 THEN NULL ELSE ISNULL(@SortState, NULL) END,
                CASE WHEN @Thumbnail_Clear = 1 THEN NULL ELSE ISNULL(@Thumbnail, NULL) END,
                CASE WHEN @CardState_Clear = 1 THEN NULL ELSE ISNULL(@CardState, NULL) END,
                CASE WHEN @DisplayState_Clear = 1 THEN NULL ELSE ISNULL(@DisplayState, NULL) END,
                CASE WHEN @ViewTypeID_Clear = 1 THEN NULL ELSE ISNULL(@ViewTypeID, NULL) END,
                CASE WHEN @Properties_Clear = 1 THEN NULL ELSE ISNULL(@Properties, NULL) END,
                ISNULL(@ApprovalStatus, 'Pending'),
                CASE WHEN @ApprovalComments_Clear = 1 THEN NULL ELSE ISNULL(@ApprovalComments, NULL) END,
                CASE WHEN @ApprovedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedByUserID, NULL) END,
                CASE WHEN @ApprovedAt_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedAt, NULL) END,
                CASE WHEN @ApprovedFingerprint_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedFingerprint, NULL) END,
                CASE WHEN @DefinitionFingerprint_Clear = 1 THEN NULL ELSE ISNULL(@DefinitionFingerprint, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwUserViews] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateUserView] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateUserView] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateUserView] FROM [cdp_UI]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserView] TO [cdp_Integration], [cdp_Developer], [cdp_UI];

/* spCreate Permissions for MJ: User Views */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateUserView] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateUserView] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateUserView] FROM [cdp_UI]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserView] TO [cdp_Integration], [cdp_Developer], [cdp_UI];

/* spUpdate SQL for MJ: User Views */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Views
-- Item: spUpdateUserView
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR UserView
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateUserView]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateUserView];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateUserView]
    @ID uniqueidentifier,
    @UserID uniqueidentifier = NULL,
    @EntityID uniqueidentifier = NULL,
    @Name nvarchar(100) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @CategoryID_Clear bit = 0,
    @CategoryID uniqueidentifier = NULL,
    @IsShared bit = NULL,
    @IsDefault bit = NULL,
    @GridState_Clear bit = 0,
    @GridState nvarchar(MAX) = NULL,
    @FilterState_Clear bit = 0,
    @FilterState nvarchar(MAX) = NULL,
    @CustomFilterState bit = NULL,
    @SmartFilterEnabled bit = NULL,
    @SmartFilterPrompt_Clear bit = 0,
    @SmartFilterPrompt nvarchar(MAX) = NULL,
    @SmartFilterWhereClause_Clear bit = 0,
    @SmartFilterWhereClause nvarchar(MAX) = NULL,
    @SmartFilterExplanation_Clear bit = 0,
    @SmartFilterExplanation nvarchar(MAX) = NULL,
    @WhereClause_Clear bit = 0,
    @WhereClause nvarchar(MAX) = NULL,
    @CustomWhereClause bit = NULL,
    @SortState_Clear bit = 0,
    @SortState nvarchar(MAX) = NULL,
    @Thumbnail_Clear bit = 0,
    @Thumbnail nvarchar(MAX) = NULL,
    @CardState_Clear bit = 0,
    @CardState nvarchar(MAX) = NULL,
    @DisplayState_Clear bit = 0,
    @DisplayState nvarchar(MAX) = NULL,
    @ViewTypeID_Clear bit = 0,
    @ViewTypeID uniqueidentifier = NULL,
    @Properties_Clear bit = 0,
    @Properties nvarchar(MAX) = NULL,
    @ApprovalStatus nvarchar(20) = NULL,
    @ApprovalComments_Clear bit = 0,
    @ApprovalComments nvarchar(MAX) = NULL,
    @ApprovedByUserID_Clear bit = 0,
    @ApprovedByUserID uniqueidentifier = NULL,
    @ApprovedAt_Clear bit = 0,
    @ApprovedAt datetimeoffset = NULL,
    @ApprovedFingerprint_Clear bit = 0,
    @ApprovedFingerprint nvarchar(100) = NULL,
    @DefinitionFingerprint_Clear bit = 0,
    @DefinitionFingerprint nvarchar(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserView]
    SET
        [UserID] = ISNULL(@UserID, [UserID]),
        [EntityID] = ISNULL(@EntityID, [EntityID]),
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [CategoryID] = CASE WHEN @CategoryID_Clear = 1 THEN NULL ELSE ISNULL(@CategoryID, [CategoryID]) END,
        [IsShared] = ISNULL(@IsShared, [IsShared]),
        [IsDefault] = ISNULL(@IsDefault, [IsDefault]),
        [GridState] = CASE WHEN @GridState_Clear = 1 THEN NULL ELSE ISNULL(@GridState, [GridState]) END,
        [FilterState] = CASE WHEN @FilterState_Clear = 1 THEN NULL ELSE ISNULL(@FilterState, [FilterState]) END,
        [CustomFilterState] = ISNULL(@CustomFilterState, [CustomFilterState]),
        [SmartFilterEnabled] = ISNULL(@SmartFilterEnabled, [SmartFilterEnabled]),
        [SmartFilterPrompt] = CASE WHEN @SmartFilterPrompt_Clear = 1 THEN NULL ELSE ISNULL(@SmartFilterPrompt, [SmartFilterPrompt]) END,
        [SmartFilterWhereClause] = CASE WHEN @SmartFilterWhereClause_Clear = 1 THEN NULL ELSE ISNULL(@SmartFilterWhereClause, [SmartFilterWhereClause]) END,
        [SmartFilterExplanation] = CASE WHEN @SmartFilterExplanation_Clear = 1 THEN NULL ELSE ISNULL(@SmartFilterExplanation, [SmartFilterExplanation]) END,
        [WhereClause] = CASE WHEN @WhereClause_Clear = 1 THEN NULL ELSE ISNULL(@WhereClause, [WhereClause]) END,
        [CustomWhereClause] = ISNULL(@CustomWhereClause, [CustomWhereClause]),
        [SortState] = CASE WHEN @SortState_Clear = 1 THEN NULL ELSE ISNULL(@SortState, [SortState]) END,
        [Thumbnail] = CASE WHEN @Thumbnail_Clear = 1 THEN NULL ELSE ISNULL(@Thumbnail, [Thumbnail]) END,
        [CardState] = CASE WHEN @CardState_Clear = 1 THEN NULL ELSE ISNULL(@CardState, [CardState]) END,
        [DisplayState] = CASE WHEN @DisplayState_Clear = 1 THEN NULL ELSE ISNULL(@DisplayState, [DisplayState]) END,
        [ViewTypeID] = CASE WHEN @ViewTypeID_Clear = 1 THEN NULL ELSE ISNULL(@ViewTypeID, [ViewTypeID]) END,
        [Properties] = CASE WHEN @Properties_Clear = 1 THEN NULL ELSE ISNULL(@Properties, [Properties]) END,
        [ApprovalStatus] = ISNULL(@ApprovalStatus, [ApprovalStatus]),
        [ApprovalComments] = CASE WHEN @ApprovalComments_Clear = 1 THEN NULL ELSE ISNULL(@ApprovalComments, [ApprovalComments]) END,
        [ApprovedByUserID] = CASE WHEN @ApprovedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedByUserID, [ApprovedByUserID]) END,
        [ApprovedAt] = CASE WHEN @ApprovedAt_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedAt, [ApprovedAt]) END,
        [ApprovedFingerprint] = CASE WHEN @ApprovedFingerprint_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedFingerprint, [ApprovedFingerprint]) END,
        [DefinitionFingerprint] = CASE WHEN @DefinitionFingerprint_Clear = 1 THEN NULL ELSE ISNULL(@DefinitionFingerprint, [DefinitionFingerprint]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwUserViews] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwUserViews]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserView] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserView] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserView] FROM [cdp_UI]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserView] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the UserView table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateUserView]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateUserView];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateUserView
ON [${flyway:defaultSchema}].[UserView]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[UserView]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[UserView] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

/* spUpdate Permissions for MJ: User Views */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserView] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserView] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserView] FROM [cdp_UI]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserView] TO [cdp_Integration], [cdp_Developer], [cdp_UI];

/* spDelete SQL for MJ: User Views */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Views
-- Item: spDeleteUserView
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR UserView
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteUserView]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteUserView];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteUserView]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[UserView]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserView] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserView] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserView] FROM [cdp_UI]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserView] TO [cdp_Integration], [cdp_Developer], [cdp_UI];

/* spDelete Permissions for MJ: User Views */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserView] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserView] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserView] FROM [cdp_UI]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserView] TO [cdp_Integration], [cdp_Developer], [cdp_UI];

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
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Query_CategoryID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Query]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[Query]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'CategoryID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Query_CategoryID ON [${flyway:defaultSchema}].[Query] ([CategoryID]);

-- Index for foreign key EmbeddingModelID in table Query
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Query_EmbeddingModelID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Query]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[Query]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'EmbeddingModelID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Query_EmbeddingModelID ON [${flyway:defaultSchema}].[Query] ([EmbeddingModelID]);

-- Index for foreign key SQLDialectID in table Query
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Query_SQLDialectID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Query]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[Query]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'SQLDialectID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Query_SQLDialectID ON [${flyway:defaultSchema}].[Query] ([SQLDialectID]);

-- Index for foreign key ExternalDataSourceID in table Query
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Query_ExternalDataSourceID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Query]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[Query]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'ExternalDataSourceID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Query_ExternalDataSourceID ON [${flyway:defaultSchema}].[Query] ([ExternalDataSourceID]);

-- Index for foreign key ApprovedByUserID in table Query
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Query_ApprovedByUserID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Query]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[Query]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'ApprovedByUserID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Query_ApprovedByUserID ON [${flyway:defaultSchema}].[Query] ([ApprovedByUserID]);

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
    MJSQLDialect_SQLDialectID.[Name] AS [SQLDialect],
    MJExternalDataSource_ExternalDataSourceID.[Name] AS [ExternalDataSource],
    MJUser_ApprovedByUserID.[Name] AS [ApprovedByUser]
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
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[SQLDialect] AS MJSQLDialect_SQLDialectID
  ON
    [q].[SQLDialectID] = MJSQLDialect_SQLDialectID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ExternalDataSource] AS MJExternalDataSource_ExternalDataSourceID
  ON
    [q].[ExternalDataSourceID] = MJExternalDataSource_ExternalDataSourceID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_ApprovedByUserID
  ON
    [q].[ApprovedByUserID] = MJUser_ApprovedByUserID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwQueries] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwQueries] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwQueries] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwQueries] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* Base View Permissions SQL for MJ: Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Queries
-- Item: Permissions for vwQueries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwQueries] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwQueries] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwQueries] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwQueries] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

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
    @CategoryID_Clear bit = 0,
    @CategoryID uniqueidentifier = NULL,
    @UserQuestion_Clear bit = 0,
    @UserQuestion nvarchar(MAX) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @SQL_Clear bit = 0,
    @SQL nvarchar(MAX) = NULL,
    @TechnicalDescription_Clear bit = 0,
    @TechnicalDescription nvarchar(MAX) = NULL,
    @OriginalSQL_Clear bit = 0,
    @OriginalSQL nvarchar(MAX) = NULL,
    @Feedback_Clear bit = 0,
    @Feedback nvarchar(MAX) = NULL,
    @Status nvarchar(15) = NULL,
    @QualityRank_Clear bit = 0,
    @QualityRank int = NULL,
    @ExecutionCostRank_Clear bit = 0,
    @ExecutionCostRank int = NULL,
    @UsesTemplate_Clear bit = 0,
    @UsesTemplate bit = NULL,
    @AuditQueryRuns bit = NULL,
    @CacheEnabled bit = NULL,
    @CacheTTLMinutes_Clear bit = 0,
    @CacheTTLMinutes int = NULL,
    @CacheMaxSize_Clear bit = 0,
    @CacheMaxSize int = NULL,
    @EmbeddingVector_Clear bit = 0,
    @EmbeddingVector nvarchar(MAX) = NULL,
    @EmbeddingModelID_Clear bit = 0,
    @EmbeddingModelID uniqueidentifier = NULL,
    @CacheValidationSQL_Clear bit = 0,
    @CacheValidationSQL nvarchar(MAX) = NULL,
    @SQLDialectID uniqueidentifier = NULL,
    @Reusable bit = NULL,
    @ExternalDataSourceID_Clear bit = 0,
    @ExternalDataSourceID uniqueidentifier = NULL,
    @IsMaterialized bit = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @EmbeddingVectorBinary_Clear bit = 0,
    @EmbeddingVectorBinary varbinary(MAX) = NULL,
    @ApprovalComments_Clear bit = 0,
    @ApprovalComments nvarchar(MAX) = NULL,
    @ApprovedByUserID_Clear bit = 0,
    @ApprovedByUserID uniqueidentifier = NULL,
    @ApprovedAt_Clear bit = 0,
    @ApprovedAt datetimeoffset = NULL,
    @ApprovedFingerprint_Clear bit = 0,
    @ApprovedFingerprint nvarchar(100) = NULL,
    @ExtractedSQLHash_Clear bit = 0,
    @ExtractedSQLHash nvarchar(64) = NULL,
    @ExtractionStatus_Clear bit = 0,
    @ExtractionStatus nvarchar(20) = NULL,
    @ExtractionMessage_Clear bit = 0,
    @ExtractionMessage nvarchar(MAX) = NULL,
    @DefinitionFingerprint_Clear bit = 0,
    @DefinitionFingerprint nvarchar(100) = NULL
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
                [Reusable],
                [ExternalDataSourceID],
                [IsMaterialized],
                [Configuration],
                [EmbeddingVectorBinary],
                [ApprovalComments],
                [ApprovedByUserID],
                [ApprovedAt],
                [ApprovedFingerprint],
                [ExtractedSQLHash],
                [ExtractionStatus],
                [ExtractionMessage],
                [DefinitionFingerprint]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @CategoryID_Clear = 1 THEN NULL ELSE ISNULL(@CategoryID, NULL) END,
                CASE WHEN @UserQuestion_Clear = 1 THEN NULL ELSE ISNULL(@UserQuestion, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @SQL_Clear = 1 THEN NULL ELSE ISNULL(@SQL, NULL) END,
                CASE WHEN @TechnicalDescription_Clear = 1 THEN NULL ELSE ISNULL(@TechnicalDescription, NULL) END,
                CASE WHEN @OriginalSQL_Clear = 1 THEN NULL ELSE ISNULL(@OriginalSQL, NULL) END,
                CASE WHEN @Feedback_Clear = 1 THEN NULL ELSE ISNULL(@Feedback, NULL) END,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @QualityRank_Clear = 1 THEN NULL ELSE ISNULL(@QualityRank, 0) END,
                CASE WHEN @ExecutionCostRank_Clear = 1 THEN NULL ELSE ISNULL(@ExecutionCostRank, NULL) END,
                CASE WHEN @UsesTemplate_Clear = 1 THEN NULL ELSE ISNULL(@UsesTemplate, 0) END,
                ISNULL(@AuditQueryRuns, 0),
                ISNULL(@CacheEnabled, 0),
                CASE WHEN @CacheTTLMinutes_Clear = 1 THEN NULL ELSE ISNULL(@CacheTTLMinutes, NULL) END,
                CASE WHEN @CacheMaxSize_Clear = 1 THEN NULL ELSE ISNULL(@CacheMaxSize, NULL) END,
                CASE WHEN @EmbeddingVector_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVector, NULL) END,
                CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, NULL) END,
                CASE WHEN @CacheValidationSQL_Clear = 1 THEN NULL ELSE ISNULL(@CacheValidationSQL, NULL) END,
                CASE WHEN @SQLDialectID = '00000000-0000-0000-0000-000000000000' THEN '1F203987-A37B-4BC1-85B3-BA50DC33C3E0' ELSE ISNULL(@SQLDialectID, '1F203987-A37B-4BC1-85B3-BA50DC33C3E0') END,
                ISNULL(@Reusable, 0),
                CASE WHEN @ExternalDataSourceID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalDataSourceID, NULL) END,
                ISNULL(@IsMaterialized, 0),
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                CASE WHEN @EmbeddingVectorBinary_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVectorBinary, NULL) END,
                CASE WHEN @ApprovalComments_Clear = 1 THEN NULL ELSE ISNULL(@ApprovalComments, NULL) END,
                CASE WHEN @ApprovedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedByUserID, NULL) END,
                CASE WHEN @ApprovedAt_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedAt, NULL) END,
                CASE WHEN @ApprovedFingerprint_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedFingerprint, NULL) END,
                CASE WHEN @ExtractedSQLHash_Clear = 1 THEN NULL ELSE ISNULL(@ExtractedSQLHash, NULL) END,
                CASE WHEN @ExtractionStatus_Clear = 1 THEN NULL ELSE ISNULL(@ExtractionStatus, NULL) END,
                CASE WHEN @ExtractionMessage_Clear = 1 THEN NULL ELSE ISNULL(@ExtractionMessage, NULL) END,
                CASE WHEN @DefinitionFingerprint_Clear = 1 THEN NULL ELSE ISNULL(@DefinitionFingerprint, NULL) END
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
                [Reusable],
                [ExternalDataSourceID],
                [IsMaterialized],
                [Configuration],
                [EmbeddingVectorBinary],
                [ApprovalComments],
                [ApprovedByUserID],
                [ApprovedAt],
                [ApprovedFingerprint],
                [ExtractedSQLHash],
                [ExtractionStatus],
                [ExtractionMessage],
                [DefinitionFingerprint]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @CategoryID_Clear = 1 THEN NULL ELSE ISNULL(@CategoryID, NULL) END,
                CASE WHEN @UserQuestion_Clear = 1 THEN NULL ELSE ISNULL(@UserQuestion, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @SQL_Clear = 1 THEN NULL ELSE ISNULL(@SQL, NULL) END,
                CASE WHEN @TechnicalDescription_Clear = 1 THEN NULL ELSE ISNULL(@TechnicalDescription, NULL) END,
                CASE WHEN @OriginalSQL_Clear = 1 THEN NULL ELSE ISNULL(@OriginalSQL, NULL) END,
                CASE WHEN @Feedback_Clear = 1 THEN NULL ELSE ISNULL(@Feedback, NULL) END,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @QualityRank_Clear = 1 THEN NULL ELSE ISNULL(@QualityRank, 0) END,
                CASE WHEN @ExecutionCostRank_Clear = 1 THEN NULL ELSE ISNULL(@ExecutionCostRank, NULL) END,
                CASE WHEN @UsesTemplate_Clear = 1 THEN NULL ELSE ISNULL(@UsesTemplate, 0) END,
                ISNULL(@AuditQueryRuns, 0),
                ISNULL(@CacheEnabled, 0),
                CASE WHEN @CacheTTLMinutes_Clear = 1 THEN NULL ELSE ISNULL(@CacheTTLMinutes, NULL) END,
                CASE WHEN @CacheMaxSize_Clear = 1 THEN NULL ELSE ISNULL(@CacheMaxSize, NULL) END,
                CASE WHEN @EmbeddingVector_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVector, NULL) END,
                CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, NULL) END,
                CASE WHEN @CacheValidationSQL_Clear = 1 THEN NULL ELSE ISNULL(@CacheValidationSQL, NULL) END,
                CASE WHEN @SQLDialectID = '00000000-0000-0000-0000-000000000000' THEN '1F203987-A37B-4BC1-85B3-BA50DC33C3E0' ELSE ISNULL(@SQLDialectID, '1F203987-A37B-4BC1-85B3-BA50DC33C3E0') END,
                ISNULL(@Reusable, 0),
                CASE WHEN @ExternalDataSourceID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalDataSourceID, NULL) END,
                ISNULL(@IsMaterialized, 0),
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                CASE WHEN @EmbeddingVectorBinary_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVectorBinary, NULL) END,
                CASE WHEN @ApprovalComments_Clear = 1 THEN NULL ELSE ISNULL(@ApprovalComments, NULL) END,
                CASE WHEN @ApprovedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedByUserID, NULL) END,
                CASE WHEN @ApprovedAt_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedAt, NULL) END,
                CASE WHEN @ApprovedFingerprint_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedFingerprint, NULL) END,
                CASE WHEN @ExtractedSQLHash_Clear = 1 THEN NULL ELSE ISNULL(@ExtractedSQLHash, NULL) END,
                CASE WHEN @ExtractionStatus_Clear = 1 THEN NULL ELSE ISNULL(@ExtractionStatus, NULL) END,
                CASE WHEN @ExtractionMessage_Clear = 1 THEN NULL ELSE ISNULL(@ExtractionMessage, NULL) END,
                CASE WHEN @DefinitionFingerprint_Clear = 1 THEN NULL ELSE ISNULL(@DefinitionFingerprint, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwQueries] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateQuery] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateQuery] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQuery] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Queries */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateQuery] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateQuery] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQuery] TO [cdp_Developer], [cdp_Integration];

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
    @Name nvarchar(255) = NULL,
    @CategoryID_Clear bit = 0,
    @CategoryID uniqueidentifier = NULL,
    @UserQuestion_Clear bit = 0,
    @UserQuestion nvarchar(MAX) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @SQL_Clear bit = 0,
    @SQL nvarchar(MAX) = NULL,
    @TechnicalDescription_Clear bit = 0,
    @TechnicalDescription nvarchar(MAX) = NULL,
    @OriginalSQL_Clear bit = 0,
    @OriginalSQL nvarchar(MAX) = NULL,
    @Feedback_Clear bit = 0,
    @Feedback nvarchar(MAX) = NULL,
    @Status nvarchar(15) = NULL,
    @QualityRank_Clear bit = 0,
    @QualityRank int = NULL,
    @ExecutionCostRank_Clear bit = 0,
    @ExecutionCostRank int = NULL,
    @UsesTemplate_Clear bit = 0,
    @UsesTemplate bit = NULL,
    @AuditQueryRuns bit = NULL,
    @CacheEnabled bit = NULL,
    @CacheTTLMinutes_Clear bit = 0,
    @CacheTTLMinutes int = NULL,
    @CacheMaxSize_Clear bit = 0,
    @CacheMaxSize int = NULL,
    @EmbeddingVector_Clear bit = 0,
    @EmbeddingVector nvarchar(MAX) = NULL,
    @EmbeddingModelID_Clear bit = 0,
    @EmbeddingModelID uniqueidentifier = NULL,
    @CacheValidationSQL_Clear bit = 0,
    @CacheValidationSQL nvarchar(MAX) = NULL,
    @SQLDialectID uniqueidentifier = NULL,
    @Reusable bit = NULL,
    @ExternalDataSourceID_Clear bit = 0,
    @ExternalDataSourceID uniqueidentifier = NULL,
    @IsMaterialized bit = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @EmbeddingVectorBinary_Clear bit = 0,
    @EmbeddingVectorBinary varbinary(MAX) = NULL,
    @ApprovalComments_Clear bit = 0,
    @ApprovalComments nvarchar(MAX) = NULL,
    @ApprovedByUserID_Clear bit = 0,
    @ApprovedByUserID uniqueidentifier = NULL,
    @ApprovedAt_Clear bit = 0,
    @ApprovedAt datetimeoffset = NULL,
    @ApprovedFingerprint_Clear bit = 0,
    @ApprovedFingerprint nvarchar(100) = NULL,
    @ExtractedSQLHash_Clear bit = 0,
    @ExtractedSQLHash nvarchar(64) = NULL,
    @ExtractionStatus_Clear bit = 0,
    @ExtractionStatus nvarchar(20) = NULL,
    @ExtractionMessage_Clear bit = 0,
    @ExtractionMessage nvarchar(MAX) = NULL,
    @DefinitionFingerprint_Clear bit = 0,
    @DefinitionFingerprint nvarchar(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Query]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [CategoryID] = CASE WHEN @CategoryID_Clear = 1 THEN NULL ELSE ISNULL(@CategoryID, [CategoryID]) END,
        [UserQuestion] = CASE WHEN @UserQuestion_Clear = 1 THEN NULL ELSE ISNULL(@UserQuestion, [UserQuestion]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [SQL] = CASE WHEN @SQL_Clear = 1 THEN NULL ELSE ISNULL(@SQL, [SQL]) END,
        [TechnicalDescription] = CASE WHEN @TechnicalDescription_Clear = 1 THEN NULL ELSE ISNULL(@TechnicalDescription, [TechnicalDescription]) END,
        [OriginalSQL] = CASE WHEN @OriginalSQL_Clear = 1 THEN NULL ELSE ISNULL(@OriginalSQL, [OriginalSQL]) END,
        [Feedback] = CASE WHEN @Feedback_Clear = 1 THEN NULL ELSE ISNULL(@Feedback, [Feedback]) END,
        [Status] = ISNULL(@Status, [Status]),
        [QualityRank] = CASE WHEN @QualityRank_Clear = 1 THEN NULL ELSE ISNULL(@QualityRank, [QualityRank]) END,
        [ExecutionCostRank] = CASE WHEN @ExecutionCostRank_Clear = 1 THEN NULL ELSE ISNULL(@ExecutionCostRank, [ExecutionCostRank]) END,
        [UsesTemplate] = CASE WHEN @UsesTemplate_Clear = 1 THEN NULL ELSE ISNULL(@UsesTemplate, [UsesTemplate]) END,
        [AuditQueryRuns] = ISNULL(@AuditQueryRuns, [AuditQueryRuns]),
        [CacheEnabled] = ISNULL(@CacheEnabled, [CacheEnabled]),
        [CacheTTLMinutes] = CASE WHEN @CacheTTLMinutes_Clear = 1 THEN NULL ELSE ISNULL(@CacheTTLMinutes, [CacheTTLMinutes]) END,
        [CacheMaxSize] = CASE WHEN @CacheMaxSize_Clear = 1 THEN NULL ELSE ISNULL(@CacheMaxSize, [CacheMaxSize]) END,
        [EmbeddingVector] = CASE WHEN @EmbeddingVector_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVector, [EmbeddingVector]) END,
        [EmbeddingModelID] = CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, [EmbeddingModelID]) END,
        [CacheValidationSQL] = CASE WHEN @CacheValidationSQL_Clear = 1 THEN NULL ELSE ISNULL(@CacheValidationSQL, [CacheValidationSQL]) END,
        [SQLDialectID] = ISNULL(@SQLDialectID, [SQLDialectID]),
        [Reusable] = ISNULL(@Reusable, [Reusable]),
        [ExternalDataSourceID] = CASE WHEN @ExternalDataSourceID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalDataSourceID, [ExternalDataSourceID]) END,
        [IsMaterialized] = ISNULL(@IsMaterialized, [IsMaterialized]),
        [Configuration] = CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, [Configuration]) END,
        [EmbeddingVectorBinary] = CASE WHEN @EmbeddingVectorBinary_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVectorBinary, [EmbeddingVectorBinary]) END,
        [ApprovalComments] = CASE WHEN @ApprovalComments_Clear = 1 THEN NULL ELSE ISNULL(@ApprovalComments, [ApprovalComments]) END,
        [ApprovedByUserID] = CASE WHEN @ApprovedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedByUserID, [ApprovedByUserID]) END,
        [ApprovedAt] = CASE WHEN @ApprovedAt_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedAt, [ApprovedAt]) END,
        [ApprovedFingerprint] = CASE WHEN @ApprovedFingerprint_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedFingerprint, [ApprovedFingerprint]) END,
        [ExtractedSQLHash] = CASE WHEN @ExtractedSQLHash_Clear = 1 THEN NULL ELSE ISNULL(@ExtractedSQLHash, [ExtractedSQLHash]) END,
        [ExtractionStatus] = CASE WHEN @ExtractionStatus_Clear = 1 THEN NULL ELSE ISNULL(@ExtractionStatus, [ExtractionStatus]) END,
        [ExtractionMessage] = CASE WHEN @ExtractionMessage_Clear = 1 THEN NULL ELSE ISNULL(@ExtractionMessage, [ExtractionMessage]) END,
        [DefinitionFingerprint] = CASE WHEN @DefinitionFingerprint_Clear = 1 THEN NULL ELSE ISNULL(@DefinitionFingerprint, [DefinitionFingerprint]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
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

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateQuery] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateQuery] FROM [cdp_Integration]
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
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[Query]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[Query] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

/* spUpdate Permissions for MJ: Queries */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateQuery] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateQuery] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateQuery] TO [cdp_Developer], [cdp_Integration];

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
    
    -- Cascade update on List using cursor to call spUpdateList
    DECLARE @MJLists_SourceQueryIDID uniqueidentifier
    DECLARE @MJLists_SourceQueryID_Name nvarchar(100)
    DECLARE @MJLists_SourceQueryID_Description nvarchar(MAX)
    DECLARE @MJLists_SourceQueryID_EntityID uniqueidentifier
    DECLARE @MJLists_SourceQueryID_UserID uniqueidentifier
    DECLARE @MJLists_SourceQueryID_CategoryID uniqueidentifier
    DECLARE @MJLists_SourceQueryID_ExternalSystemRecordID nvarchar(100)
    DECLARE @MJLists_SourceQueryID_CompanyIntegrationID uniqueidentifier
    DECLARE @MJLists_SourceQueryID_SourceViewID uniqueidentifier
    DECLARE @MJLists_SourceQueryID_SourceFilterSnapshot nvarchar(MAX)
    DECLARE @MJLists_SourceQueryID_LastRefreshedAt datetimeoffset
    DECLARE @MJLists_SourceQueryID_LastRefreshedByUserID uniqueidentifier
    DECLARE @MJLists_SourceQueryID_RefreshMode nvarchar(20)
    DECLARE @MJLists_SourceQueryID_UseSnapshot bit
    DECLARE @MJLists_SourceQueryID_SourceQueryID uniqueidentifier
    DECLARE @MJLists_SourceQueryID_SourceQueryParameters nvarchar(MAX)
    DECLARE @MJLists_SourceQueryID_SourceQueryKeyField nvarchar(255)
    DECLARE @MJLists_SourceQueryID_SourceFingerprint nvarchar(100)
    DECLARE @MJLists_SourceQueryID_AutoRefresh bit
    DECLARE @MJLists_SourceQueryID_RefreshRoutineID uniqueidentifier
    DECLARE cascade_update_MJLists_SourceQueryID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [EntityID], [UserID], [CategoryID], [ExternalSystemRecordID], [CompanyIntegrationID], [SourceViewID], [SourceFilterSnapshot], [LastRefreshedAt], [LastRefreshedByUserID], [RefreshMode], [UseSnapshot], [SourceQueryID], [SourceQueryParameters], [SourceQueryKeyField], [SourceFingerprint], [AutoRefresh], [RefreshRoutineID]
        FROM [${flyway:defaultSchema}].[List]
        WHERE [SourceQueryID] = @ID

    OPEN cascade_update_MJLists_SourceQueryID_cursor
    FETCH NEXT FROM cascade_update_MJLists_SourceQueryID_cursor INTO @MJLists_SourceQueryIDID, @MJLists_SourceQueryID_Name, @MJLists_SourceQueryID_Description, @MJLists_SourceQueryID_EntityID, @MJLists_SourceQueryID_UserID, @MJLists_SourceQueryID_CategoryID, @MJLists_SourceQueryID_ExternalSystemRecordID, @MJLists_SourceQueryID_CompanyIntegrationID, @MJLists_SourceQueryID_SourceViewID, @MJLists_SourceQueryID_SourceFilterSnapshot, @MJLists_SourceQueryID_LastRefreshedAt, @MJLists_SourceQueryID_LastRefreshedByUserID, @MJLists_SourceQueryID_RefreshMode, @MJLists_SourceQueryID_UseSnapshot, @MJLists_SourceQueryID_SourceQueryID, @MJLists_SourceQueryID_SourceQueryParameters, @MJLists_SourceQueryID_SourceQueryKeyField, @MJLists_SourceQueryID_SourceFingerprint, @MJLists_SourceQueryID_AutoRefresh, @MJLists_SourceQueryID_RefreshRoutineID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJLists_SourceQueryID_SourceQueryID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateList] @ID = @MJLists_SourceQueryIDID, @Name = @MJLists_SourceQueryID_Name, @Description = @MJLists_SourceQueryID_Description, @EntityID = @MJLists_SourceQueryID_EntityID, @UserID = @MJLists_SourceQueryID_UserID, @CategoryID = @MJLists_SourceQueryID_CategoryID, @ExternalSystemRecordID = @MJLists_SourceQueryID_ExternalSystemRecordID, @CompanyIntegrationID = @MJLists_SourceQueryID_CompanyIntegrationID, @SourceViewID = @MJLists_SourceQueryID_SourceViewID, @SourceFilterSnapshot = @MJLists_SourceQueryID_SourceFilterSnapshot, @LastRefreshedAt = @MJLists_SourceQueryID_LastRefreshedAt, @LastRefreshedByUserID = @MJLists_SourceQueryID_LastRefreshedByUserID, @RefreshMode = @MJLists_SourceQueryID_RefreshMode, @UseSnapshot = @MJLists_SourceQueryID_UseSnapshot, @SourceQueryID_Clear = 1, @SourceQueryID = @MJLists_SourceQueryID_SourceQueryID, @SourceQueryParameters = @MJLists_SourceQueryID_SourceQueryParameters, @SourceQueryKeyField = @MJLists_SourceQueryID_SourceQueryKeyField, @SourceFingerprint = @MJLists_SourceQueryID_SourceFingerprint, @AutoRefresh = @MJLists_SourceQueryID_AutoRefresh, @RefreshRoutineID = @MJLists_SourceQueryID_RefreshRoutineID

        FETCH NEXT FROM cascade_update_MJLists_SourceQueryID_cursor INTO @MJLists_SourceQueryIDID, @MJLists_SourceQueryID_Name, @MJLists_SourceQueryID_Description, @MJLists_SourceQueryID_EntityID, @MJLists_SourceQueryID_UserID, @MJLists_SourceQueryID_CategoryID, @MJLists_SourceQueryID_ExternalSystemRecordID, @MJLists_SourceQueryID_CompanyIntegrationID, @MJLists_SourceQueryID_SourceViewID, @MJLists_SourceQueryID_SourceFilterSnapshot, @MJLists_SourceQueryID_LastRefreshedAt, @MJLists_SourceQueryID_LastRefreshedByUserID, @MJLists_SourceQueryID_RefreshMode, @MJLists_SourceQueryID_UseSnapshot, @MJLists_SourceQueryID_SourceQueryID, @MJLists_SourceQueryID_SourceQueryParameters, @MJLists_SourceQueryID_SourceQueryKeyField, @MJLists_SourceQueryID_SourceFingerprint, @MJLists_SourceQueryID_AutoRefresh, @MJLists_SourceQueryID_RefreshRoutineID
    END

    CLOSE cascade_update_MJLists_SourceQueryID_cursor
    DEALLOCATE cascade_update_MJLists_SourceQueryID_cursor
    
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

/* Refresh custom base views before entity field sync so new columns are not pruned */
EXEC sp_refreshview '${flyway:defaultSchema}.vwUserViews';

/* SQL text to insert 2 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '095d630b-6c43-4819-9227-b2159eca6144' OR (EntityID = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'SourceQuery')) BEGIN
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
            '095d630b-6c43-4819-9227-b2159eca6144',
            'EE238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Lists
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'EE238F34-2837-EF11-86D4-6045BDEE16E6'),
            'SourceQuery',
            'Source Query',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b97bd11f-34ae-4abc-889d-d8a8f1033090' OR (EntityID = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RefreshRoutine')) BEGIN
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
            'b97bd11f-34ae-4abc-889d-d8a8f1033090',
            'EE238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Lists
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'EE238F34-2837-EF11-86D4-6045BDEE16E6'),
            'RefreshRoutine',
            'Refresh Routine',
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

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '1BC9D307-DD54-440F-98B4-0B8E12E47F6C'
               AND AutoUpdateDefaultInView = 1;

/* Set categories for 8 fields */

-- UPDATE Entity Field Category Info MJ: Lists.SourceQueryID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Refresh Settings',
   GeneratedFormSection = 'Category',
   DisplayName = 'Source Query'
WHERE 
   ID = 'DAF4AE68-84D8-40CC-9CF9-92BF0B02091B';

-- UPDATE Entity Field Category Info MJ: Lists.SourceQueryParameters 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Refresh Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'C5BD134F-1DEE-476C-AA1D-1909F5E2B0E1';

-- UPDATE Entity Field Category Info MJ: Lists.SourceQueryKeyField 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Refresh Settings',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '3D493E7A-9714-4410-B994-ECAFDA3A63FA';

-- UPDATE Entity Field Category Info MJ: Lists.SourceFingerprint 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Refresh Settings',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '5D9E2EF4-7F87-4B5C-B994-8CE16245F821';

-- UPDATE Entity Field Category Info MJ: Lists.AutoRefresh 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Refresh Settings',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1BC9D307-DD54-440F-98B4-0B8E12E47F6C';

-- UPDATE Entity Field Category Info MJ: Lists.RefreshRoutineID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Refresh Settings',
   GeneratedFormSection = 'Category',
   DisplayName = 'Refresh Routine'
WHERE 
   ID = '399F145C-B667-4A95-8275-2FDBD5A395E1';

-- UPDATE Entity Field Category Info MJ: Lists.SourceQuery 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Refresh Settings',
   GeneratedFormSection = 'Category',
   DisplayName = 'Source Query Name'
WHERE 
   ID = '095D630B-6C43-4819-9227-B2159ECA6144';

-- UPDATE Entity Field Category Info MJ: Lists.RefreshRoutine 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Refresh Settings',
   GeneratedFormSection = 'Category',
   DisplayName = 'Refresh Routine Name'
WHERE 
   ID = 'B97BD11F-34AE-4ABC-889D-D8A8F1033090';

/* Set categories for 10 fields */

-- UPDATE Entity Field Category Info MJ: Queries.EmbeddingVectorBinary 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'AI & Embeddings',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'B88EF2F6-711F-4081-9EBC-3562BE686115';

-- UPDATE Entity Field Category Info MJ: Queries.ApprovalComments 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Performance & Quality',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1A797FF0-7480-4713-A3C5-C12A4BAFDD78';

-- UPDATE Entity Field Category Info MJ: Queries.ApprovedByUserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Performance & Quality',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'BEAD11E7-68D4-47F8-9A22-B014DD027E9F';

-- UPDATE Entity Field Category Info MJ: Queries.ApprovedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Performance & Quality',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '95F734C1-874E-47FE-B9A1-6659945529E9';

-- UPDATE Entity Field Category Info MJ: Queries.ApprovedFingerprint 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Performance & Quality',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E18565D4-0E4D-4B49-BCF5-6F2F01251113';

-- UPDATE Entity Field Category Info MJ: Queries.ExtractedSQLHash 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Query Definition',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C7BB26CF-5A35-41CD-949D-7A119B8FDBC2';

-- UPDATE Entity Field Category Info MJ: Queries.ExtractionStatus 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Query Definition',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A97BB493-7B84-482A-97F0-F1ADFB743FDA';

-- UPDATE Entity Field Category Info MJ: Queries.ExtractionMessage 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Query Definition',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '58647807-90B8-4E45-B2C2-61496F73BE71';

-- UPDATE Entity Field Category Info MJ: Queries.DefinitionFingerprint 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Query Definition',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'DCCF5D20-DF77-447E-AABF-B52299952815';

-- UPDATE Entity Field Category Info MJ: Queries.ApprovedByUser 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Performance & Quality',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'B3C32071-A960-4106-9967-0CF7C027D692';

/* Set categories for 8 fields */

-- UPDATE Entity Field Category Info MJ: User Views.ViewTypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Display Settings',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '2C22A535-A97A-4490-9A56-660A29D31890';

-- UPDATE Entity Field Category Info MJ: User Views.Properties 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'View Definition & Settings',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '51D42EDA-32A8-4AC6-A745-2BB16CC4DD41';

-- UPDATE Entity Field Category Info MJ: User Views.ApprovalStatus 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Approval & Governance',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'CD52C98A-3AAD-40E7-BCB3-5347C8B4CFC9';

-- UPDATE Entity Field Category Info MJ: User Views.ApprovalComments 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Approval & Governance',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '6EC8D697-BA09-4785-8DFE-67FE0CAB84FA';

-- UPDATE Entity Field Category Info MJ: User Views.ApprovedByUserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Approval & Governance',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C9F01B34-7AA8-4769-B86F-5213A812D9CB';

-- UPDATE Entity Field Category Info MJ: User Views.ApprovedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Approval & Governance',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '3F1AAEFC-0F15-4017-9A21-682075967B18';

-- UPDATE Entity Field Category Info MJ: User Views.ApprovedFingerprint 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Approval & Governance',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'DC9C05E1-2E62-417A-AF5F-778D81694F90';

-- UPDATE Entity Field Category Info MJ: User Views.DefinitionFingerprint 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'View Definition & Settings',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A9062F72-7C0C-4C1A-9D80-DE1E3BD7C905';

/* Update FieldCategoryInfo setting for entity */

                  UPDATE [${flyway:defaultSchema}].[EntitySetting]
                  SET [Value] = '{
  "Approval & Governance": {
    "description": "View approval status, reviewer comments, and security fingerprints.",
    "icon": "fa fa-check-circle"
  },
  "Display Settings": {
    "description": "Configuration for view display modes such as grid, cards, timeline, and chart",
    "icon": "fa fa-eye"
  },
  "Entity Context": {
    "description": "",
    "icon": "fa fa-database"
  },
  "Filtering & Smart Search": {
    "description": "",
    "icon": "fa fa-search"
  },
  "System Metadata": {
    "description": "",
    "icon": "fa fa-cog"
  },
  "User & Ownership": {
    "description": "",
    "icon": "fa fa-user"
  },
  "View Definition & Settings": {
    "description": "",
    "icon": "fa fa-sliders-h"
  }
}', [__mj_UpdatedAt] = GETUTCDATE()
                  WHERE [EntityID] = 'E4238F34-2837-EF11-86D4-6045BDEE16E6' AND [Name] = 'FieldCategoryInfo';

/* Update FieldCategoryIcons setting (legacy) */

                  UPDATE [${flyway:defaultSchema}].[EntitySetting]
                  SET [Value] = '{
  "Approval & Governance": "fa fa-check-circle",
  "Display Settings": "fa fa-eye",
  "Entity Context": "fa fa-database",
  "Filtering & Smart Search": "fa fa-search",
  "System Metadata": "fa fa-cog",
  "User & Ownership": "fa fa-user",
  "View Definition & Settings": "fa fa-sliders-h"
}', [__mj_UpdatedAt] = GETUTCDATE()
                  WHERE [EntityID] = 'E4238F34-2837-EF11-86D4-6045BDEE16E6' AND [Name] = 'FieldCategoryIcons';

/* Refresh custom base views for modified entities so schema changes are picked up */
EXEC sp_refreshview '${flyway:defaultSchema}.vwUserViews';

