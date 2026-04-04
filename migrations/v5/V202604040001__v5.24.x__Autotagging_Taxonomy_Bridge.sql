-- Autotagging Taxonomy Bridge: Schema changes for plugin architecture, entity-source rebuild,
-- tag taxonomy bridge, and tagged item weights.
--
-- Changes:
--   ContentSourceType: +DriverClass, +Configuration
--   ContentSource:     +Configuration, +EntityID (FK Entity), +EntityDocumentID (FK EntityDocument)
--   ContentType:       +Configuration
--   ContentItem:       +EntityRecordDocumentID (FK EntityRecordDocument)
--   ContentItemTag:    +TagID (FK Tag)
--   TaggedItem:        +Weight
--

----------------------------------------------------------------------
-- 1. DDL: ALTER TABLE statements
----------------------------------------------------------------------

-- ContentSourceType: add DriverClass and Configuration
ALTER TABLE ${flyway:defaultSchema}.ContentSourceType
    ADD DriverClass NVARCHAR(255) NULL,
        Configuration NVARCHAR(MAX) NULL;
GO

-- ContentSource: add Configuration, EntityID, EntityDocumentID
ALTER TABLE ${flyway:defaultSchema}.ContentSource
    ADD Configuration NVARCHAR(MAX) NULL,
        EntityID UNIQUEIDENTIFIER NULL
            CONSTRAINT FK_ContentSource_Entity FOREIGN KEY REFERENCES ${flyway:defaultSchema}.Entity(ID),
        EntityDocumentID UNIQUEIDENTIFIER NULL
            CONSTRAINT FK_ContentSource_EntityDocument FOREIGN KEY REFERENCES ${flyway:defaultSchema}.EntityDocument(ID);
GO

-- ContentType: add Configuration
ALTER TABLE ${flyway:defaultSchema}.ContentType
    ADD Configuration NVARCHAR(MAX) NULL;
GO

-- ContentItem: add EntityRecordDocumentID
ALTER TABLE ${flyway:defaultSchema}.ContentItem
    ADD EntityRecordDocumentID UNIQUEIDENTIFIER NULL
        CONSTRAINT FK_ContentItem_EntityRecordDocument FOREIGN KEY REFERENCES ${flyway:defaultSchema}.EntityRecordDocument(ID);
GO

-- ContentItemTag: add TagID
ALTER TABLE ${flyway:defaultSchema}.ContentItemTag
    ADD TagID UNIQUEIDENTIFIER NULL
        CONSTRAINT FK_ContentItemTag_Tag FOREIGN KEY REFERENCES ${flyway:defaultSchema}.Tag(ID);
GO

-- TaggedItem: add Weight
ALTER TABLE ${flyway:defaultSchema}.TaggedItem
    ADD Weight NUMERIC(5, 4) NOT NULL CONSTRAINT DF_TaggedItem_Weight DEFAULT 1.0;
GO



----------------------------------------------------------------------
-- 2. Extended Properties
----------------------------------------------------------------------

-- ContentSourceType.DriverClass
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The registered class name used by ClassFactory to instantiate the provider for this source type (e.g., AutotagLocalFileSystem, AutotagEntity). Must match a @RegisterClass key on a class extending AutotagBase.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ContentSourceType',
    @level2type = N'COLUMN', @level2name = 'DriverClass';

-- ContentSourceType.Configuration
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON configuration blob for type-level settings. Conforms to the IContentSourceTypeConfiguration interface. Reserved for future type-wide settings shared by all sources of this type.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ContentSourceType',
    @level2type = N'COLUMN', @level2name = 'Configuration';

-- ContentSource.Configuration
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON configuration blob for source-instance settings. Conforms to the IContentSourceConfiguration interface. Includes tag taxonomy mode (constrained/auto-grow/free-flow), tag root ID, match threshold, LLM taxonomy sharing, and vectorization toggle.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ContentSource',
    @level2type = N'COLUMN', @level2name = 'Configuration';

-- ContentSource.EntityID
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'For Entity-type content sources, the MJ Entity to pull records from. NULL for non-entity sources (files, RSS, websites, etc.).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ContentSource',
    @level2type = N'COLUMN', @level2name = 'EntityID';

-- ContentSource.EntityDocumentID
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'For Entity-type content sources, the Entity Document template used to render entity records into text for autotagging. The template defines which fields to include, how to format them, and related record inclusion. NULL for non-entity sources.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ContentSource',
    @level2type = N'COLUMN', @level2name = 'EntityDocumentID';

-- ContentType.Configuration
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON configuration blob for content-type-level settings. Conforms to the IContentTypeConfiguration interface. Reserved for future type-wide settings such as default tag taxonomy rules and processing options.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ContentType',
    @level2type = N'COLUMN', @level2name = 'Configuration';

-- ContentItem.EntityRecordDocumentID
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'For entity-sourced content items, links to the Entity Record Document snapshot that was rendered for this item. Provides traceability back to the source entity record via ERD.EntityID + ERD.RecordID. NULL for non-entity sources.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ContentItem',
    @level2type = N'COLUMN', @level2name = 'EntityRecordDocumentID';

-- ContentItemTag.TagID
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional link to the formal MJ Tag taxonomy. When set, this free-text tag has been matched (via semantic similarity or exact match) to a curated Tag record. NULL means the tag is unmatched free text only.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ContentItemTag',
    @level2type = N'COLUMN', @level2name = 'TagID';

-- TaggedItem.Weight
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Relevance weight of this tag association (0.0 to 1.0). 1.0 indicates the tag is highly relevant or was manually applied. Lower values indicate decreasing relevance as determined by LLM autotagging. Default 1.0 for manually applied tags.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'TaggedItem',
    @level2type = N'COLUMN', @level2name = 'Weight';





































































-- CODE GEN RUN
/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4d458c41-0728-4544-af26-510ef88cffae' OR (EntityID = '0D248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Weight')) BEGIN
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
            '4d458c41-0728-4544-af26-510ef88cffae',
            '0D248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Tagged Items
            100015,
            'Weight',
            'Weight',
            'Relevance weight of this tag association (0.0 to 1.0). 1.0 indicates the tag is highly relevant or was manually applied. Lower values indicate decreasing relevance as determined by LLM autotagging. Default 1.0 for manually applied tags.',
            'numeric',
            5,
            5,
            4,
            0,
            '(1.0)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '932ee746-f4e7-4036-92b0-733d799c2fbb' OR (EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'Configuration')) BEGIN
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
            '932ee746-f4e7-4036-92b0-733d799c2fbb',
            'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Sources
            100026,
            'Configuration',
            'Configuration',
            'JSON configuration blob for source-instance settings. Conforms to the IContentSourceConfiguration interface. Includes tag taxonomy mode (constrained/auto-grow/free-flow), tag root ID, match threshold, LLM taxonomy sharing, and vectorization toggle.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f96701f4-70d5-4cb6-a277-6430b51541de' OR (EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'EntityID')) BEGIN
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
            'f96701f4-70d5-4cb6-a277-6430b51541de',
            'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Sources
            100027,
            'EntityID',
            'Entity ID',
            'For Entity-type content sources, the MJ Entity to pull records from. NULL for non-entity sources (files, RSS, websites, etc.).',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e4284a80-be82-4fbe-b8c0-5a281cd1ffed' OR (EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'EntityDocumentID')) BEGIN
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
            'e4284a80-be82-4fbe-b8c0-5a281cd1ffed',
            'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Sources
            100028,
            'EntityDocumentID',
            'Entity Document ID',
            'For Entity-type content sources, the Entity Document template used to render entity records into text for autotagging. The template defines which fields to include, how to format them, and related record inclusion. NULL for non-entity sources.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            '22248F34-2837-EF11-86D4-6045BDEE16E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e660536a-6990-4e69-b2ff-eded2f11afe9' OR (EntityID = 'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'DriverClass')) BEGIN
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
            'e660536a-6990-4e69-b2ff-eded2f11afe9',
            'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Source Types
            100011,
            'DriverClass',
            'Driver Class',
            'The registered class name used by ClassFactory to instantiate the provider for this source type (e.g., AutotagLocalFileSystem, AutotagEntity). Must match a @RegisterClass key on a class extending AutotagBase.',
            'nvarchar',
            510,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '933ab75a-674f-46c8-a471-40d648208f94' OR (EntityID = 'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'Configuration')) BEGIN
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
            '933ab75a-674f-46c8-a471-40d648208f94',
            'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Source Types
            100012,
            'Configuration',
            'Configuration',
            'JSON configuration blob for type-level settings. Conforms to the IContentSourceTypeConfiguration interface. Reserved for future type-wide settings shared by all sources of this type.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd2e39013-5c05-4b67-b415-c5f8f43220aa' OR (EntityID = 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'Configuration')) BEGIN
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
            'd2e39013-5c05-4b67-b415-c5f8f43220aa',
            'A793AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Types
            100024,
            'Configuration',
            'Configuration',
            'JSON configuration blob for content-type-level settings. Conforms to the IContentTypeConfiguration interface. Reserved for future type-wide settings such as default tag taxonomy rules and processing options.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dfe539d5-8eb6-44f9-8b56-47110e540579' OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'EntityRecordDocumentID')) BEGIN
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
            'dfe539d5-8eb6-44f9-8b56-47110e540579',
            'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Items
            100029,
            'EntityRecordDocumentID',
            'Entity Record Document ID',
            'For entity-sourced content items, links to the Entity Record Document snapshot that was rendered for this item. Provides traceability back to the source entity record via ERD.EntityID + ERD.RecordID. NULL for non-entity sources.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            '21248F34-2837-EF11-86D4-6045BDEE16E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e47c091d-60ae-4e36-9e13-6ad8422c0bba' OR (EntityID = 'F63EC656-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'TagID')) BEGIN
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
            'e47c091d-60ae-4e36-9e13-6ad8422c0bba',
            'F63EC656-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Item Tags
            100014,
            'TagID',
            'Tag ID',
            'Optional link to the formal MJ Tag taxonomy. When set, this free-text tag has been matched (via semantic similarity or exact match) to a curated Tag record. NULL means the tag is unmatched free text only.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            '0C248F34-2837-EF11-86D4-6045BDEE16E6',
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


/* Create Entity Relationship: MJ: Entities -> MJ: Content Sources (One To Many via EntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'a1c0e58e-97bc-481a-a311-1583ef46649d'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('a1c0e58e-97bc-481a-a311-1583ef46649d', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 'EntityID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Tags -> MJ: Content Item Tags (One To Many via TagID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '0fa1cdc5-8589-462f-80f6-32ffe9d19dd7'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('0fa1cdc5-8589-462f-80f6-32ffe9d19dd7', '0C248F34-2837-EF11-86D4-6045BDEE16E6', 'F63EC656-0E66-EF11-A752-C0A5E8ACCB22', 'TagID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Entity Record Documents -> MJ: Content Items (One To Many via EntityRecordDocumentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '6e3ae212-055e-415f-81df-43ddb6c8ffc8'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('6e3ae212-055e-415f-81df-43ddb6c8ffc8', '21248F34-2837-EF11-86D4-6045BDEE16E6', 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 'EntityRecordDocumentID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Entity Documents -> MJ: Content Sources (One To Many via EntityDocumentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '18d9af55-c138-49a2-8edb-e5e36bfb81aa'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('18d9af55-c138-49a2-8edb-e5e36bfb81aa', '22248F34-2837-EF11-86D4-6045BDEE16E6', 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 'EntityDocumentID', 'One To Many', 1, 1, 5, GETUTCDATE(), GETUTCDATE())
   END;
                    

/* Index for Foreign Keys for ContentItemTag */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Tags
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ItemID in table ContentItemTag
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentItemTag_ItemID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentItemTag]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentItemTag_ItemID ON [${flyway:defaultSchema}].[ContentItemTag] ([ItemID]);

-- Index for foreign key TagID in table ContentItemTag
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentItemTag_TagID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentItemTag]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentItemTag_TagID ON [${flyway:defaultSchema}].[ContentItemTag] ([TagID]);

/* SQL text to update entity field related entity name field map for entity field ID E47C091D-60AE-4E36-9E13-6AD8422C0BBA */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='E47C091D-60AE-4E36-9E13-6AD8422C0BBA', @RelatedEntityNameFieldMap='Tag_Virtual'

/* Index for Foreign Keys for ContentItem */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Items
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ContentSourceID in table ContentItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentItem_ContentSourceID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentItem_ContentSourceID ON [${flyway:defaultSchema}].[ContentItem] ([ContentSourceID]);

-- Index for foreign key ContentTypeID in table ContentItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentItem_ContentTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentItem_ContentTypeID ON [${flyway:defaultSchema}].[ContentItem] ([ContentTypeID]);

-- Index for foreign key ContentSourceTypeID in table ContentItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentItem_ContentSourceTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentItem_ContentSourceTypeID ON [${flyway:defaultSchema}].[ContentItem] ([ContentSourceTypeID]);

-- Index for foreign key ContentFileTypeID in table ContentItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentItem_ContentFileTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentItem_ContentFileTypeID ON [${flyway:defaultSchema}].[ContentItem] ([ContentFileTypeID]);

-- Index for foreign key EntityRecordDocumentID in table ContentItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentItem_EntityRecordDocumentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentItem_EntityRecordDocumentID ON [${flyway:defaultSchema}].[ContentItem] ([EntityRecordDocumentID]);

/* SQL text to update entity field related entity name field map for entity field ID DFE539D5-8EB6-44F9-8B56-47110E540579 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='DFE539D5-8EB6-44F9-8B56-47110E540579', @RelatedEntityNameFieldMap='EntityRecordDocument'

/* Base View SQL for MJ: Content Item Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Tags
-- Item: vwContentItemTags
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Content Item Tags
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ContentItemTag
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwContentItemTags]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwContentItemTags];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwContentItemTags]
AS
SELECT
    c.*,
    MJContentItem_ItemID.[Name] AS [Item],
    MJTag_TagID.[Name] AS [Tag_Virtual]
FROM
    [${flyway:defaultSchema}].[ContentItemTag] AS c
INNER JOIN
    [${flyway:defaultSchema}].[ContentItem] AS MJContentItem_ItemID
  ON
    [c].[ItemID] = MJContentItem_ItemID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Tag] AS MJTag_TagID
  ON
    [c].[TagID] = MJTag_TagID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentItemTags] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Content Item Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Tags
-- Item: Permissions for vwContentItemTags
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwContentItemTags] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Content Item Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Tags
-- Item: spCreateContentItemTag
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContentItemTag
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateContentItemTag]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateContentItemTag];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateContentItemTag]
    @ID uniqueidentifier = NULL,
    @ItemID uniqueidentifier,
    @Tag nvarchar(200),
    @Weight numeric(5, 4) = NULL,
    @TagID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ContentItemTag]
            (
                [ID],
                [ItemID],
                [Tag],
                [Weight],
                [TagID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ItemID,
                @Tag,
                ISNULL(@Weight, 1.0),
                @TagID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ContentItemTag]
            (
                [ItemID],
                [Tag],
                [Weight],
                [TagID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ItemID,
                @Tag,
                ISNULL(@Weight, 1.0),
                @TagID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwContentItemTags] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentItemTag] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Content Item Tags */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentItemTag] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Content Item Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Tags
-- Item: spUpdateContentItemTag
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentItemTag
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateContentItemTag]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateContentItemTag];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateContentItemTag]
    @ID uniqueidentifier,
    @ItemID uniqueidentifier,
    @Tag nvarchar(200),
    @Weight numeric(5, 4),
    @TagID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentItemTag]
    SET
        [ItemID] = @ItemID,
        [Tag] = @Tag,
        [Weight] = @Weight,
        [TagID] = @TagID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwContentItemTags] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwContentItemTags]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentItemTag] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentItemTag table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateContentItemTag]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateContentItemTag];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateContentItemTag
ON [${flyway:defaultSchema}].[ContentItemTag]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentItemTag]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ContentItemTag] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Content Item Tags */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentItemTag] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Content Item Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Tags
-- Item: spDeleteContentItemTag
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentItemTag
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteContentItemTag]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteContentItemTag];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteContentItemTag]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ContentItemTag]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentItemTag] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Content Item Tags */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentItemTag] TO [cdp_Integration]



/* Base View SQL for MJ: Content Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Items
-- Item: vwContentItems
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Content Items
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ContentItem
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwContentItems]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwContentItems];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwContentItems]
AS
SELECT
    c.*,
    MJContentSource_ContentSourceID.[Name] AS [ContentSource],
    MJContentType_ContentTypeID.[Name] AS [ContentType],
    MJContentSourceType_ContentSourceTypeID.[Name] AS [ContentSourceType],
    MJContentFileType_ContentFileTypeID.[Name] AS [ContentFileType],
    MJEntityRecordDocument_EntityRecordDocumentID.[RecordID] AS [EntityRecordDocument]
FROM
    [${flyway:defaultSchema}].[ContentItem] AS c
INNER JOIN
    [${flyway:defaultSchema}].[ContentSource] AS MJContentSource_ContentSourceID
  ON
    [c].[ContentSourceID] = MJContentSource_ContentSourceID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[ContentType] AS MJContentType_ContentTypeID
  ON
    [c].[ContentTypeID] = MJContentType_ContentTypeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[ContentSourceType] AS MJContentSourceType_ContentSourceTypeID
  ON
    [c].[ContentSourceTypeID] = MJContentSourceType_ContentSourceTypeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[ContentFileType] AS MJContentFileType_ContentFileTypeID
  ON
    [c].[ContentFileTypeID] = MJContentFileType_ContentFileTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[EntityRecordDocument] AS MJEntityRecordDocument_EntityRecordDocumentID
  ON
    [c].[EntityRecordDocumentID] = MJEntityRecordDocument_EntityRecordDocumentID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentItems] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Content Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Items
-- Item: Permissions for vwContentItems
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwContentItems] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Content Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Items
-- Item: spCreateContentItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContentItem
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateContentItem]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateContentItem];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateContentItem]
    @ID uniqueidentifier = NULL,
    @ContentSourceID uniqueidentifier,
    @Name nvarchar(250),
    @Description nvarchar(MAX),
    @ContentTypeID uniqueidentifier,
    @ContentSourceTypeID uniqueidentifier,
    @ContentFileTypeID uniqueidentifier,
    @Checksum nvarchar(100),
    @URL nvarchar(2000),
    @Text nvarchar(MAX),
    @EntityRecordDocumentID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ContentItem]
            (
                [ID],
                [ContentSourceID],
                [Name],
                [Description],
                [ContentTypeID],
                [ContentSourceTypeID],
                [ContentFileTypeID],
                [Checksum],
                [URL],
                [Text],
                [EntityRecordDocumentID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ContentSourceID,
                @Name,
                @Description,
                @ContentTypeID,
                @ContentSourceTypeID,
                @ContentFileTypeID,
                @Checksum,
                @URL,
                @Text,
                @EntityRecordDocumentID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ContentItem]
            (
                [ContentSourceID],
                [Name],
                [Description],
                [ContentTypeID],
                [ContentSourceTypeID],
                [ContentFileTypeID],
                [Checksum],
                [URL],
                [Text],
                [EntityRecordDocumentID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ContentSourceID,
                @Name,
                @Description,
                @ContentTypeID,
                @ContentSourceTypeID,
                @ContentFileTypeID,
                @Checksum,
                @URL,
                @Text,
                @EntityRecordDocumentID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwContentItems] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentItem] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Content Items */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentItem] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Content Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Items
-- Item: spUpdateContentItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentItem
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateContentItem]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateContentItem];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateContentItem]
    @ID uniqueidentifier,
    @ContentSourceID uniqueidentifier,
    @Name nvarchar(250),
    @Description nvarchar(MAX),
    @ContentTypeID uniqueidentifier,
    @ContentSourceTypeID uniqueidentifier,
    @ContentFileTypeID uniqueidentifier,
    @Checksum nvarchar(100),
    @URL nvarchar(2000),
    @Text nvarchar(MAX),
    @EntityRecordDocumentID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentItem]
    SET
        [ContentSourceID] = @ContentSourceID,
        [Name] = @Name,
        [Description] = @Description,
        [ContentTypeID] = @ContentTypeID,
        [ContentSourceTypeID] = @ContentSourceTypeID,
        [ContentFileTypeID] = @ContentFileTypeID,
        [Checksum] = @Checksum,
        [URL] = @URL,
        [Text] = @Text,
        [EntityRecordDocumentID] = @EntityRecordDocumentID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwContentItems] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwContentItems]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentItem] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentItem table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateContentItem]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateContentItem];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateContentItem
ON [${flyway:defaultSchema}].[ContentItem]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentItem]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ContentItem] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Content Items */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentItem] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Content Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Items
-- Item: spDeleteContentItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentItem
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteContentItem]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteContentItem];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteContentItem]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ContentItem]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentItem] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Content Items */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentItem] TO [cdp_Integration]



/* Index for Foreign Keys for ContentSourceType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Source Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for ContentSource */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Sources
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ContentTypeID in table ContentSource
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentSource_ContentTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentSource]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentSource_ContentTypeID ON [${flyway:defaultSchema}].[ContentSource] ([ContentTypeID]);

-- Index for foreign key ContentSourceTypeID in table ContentSource
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentSource_ContentSourceTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentSource]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentSource_ContentSourceTypeID ON [${flyway:defaultSchema}].[ContentSource] ([ContentSourceTypeID]);

-- Index for foreign key ContentFileTypeID in table ContentSource
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentSource_ContentFileTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentSource]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentSource_ContentFileTypeID ON [${flyway:defaultSchema}].[ContentSource] ([ContentFileTypeID]);

-- Index for foreign key EmbeddingModelID in table ContentSource
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentSource_EmbeddingModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentSource]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentSource_EmbeddingModelID ON [${flyway:defaultSchema}].[ContentSource] ([EmbeddingModelID]);

-- Index for foreign key VectorIndexID in table ContentSource
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentSource_VectorIndexID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentSource]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentSource_VectorIndexID ON [${flyway:defaultSchema}].[ContentSource] ([VectorIndexID]);

-- Index for foreign key EntityID in table ContentSource
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentSource_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentSource]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentSource_EntityID ON [${flyway:defaultSchema}].[ContentSource] ([EntityID]);

-- Index for foreign key EntityDocumentID in table ContentSource
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentSource_EntityDocumentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentSource]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentSource_EntityDocumentID ON [${flyway:defaultSchema}].[ContentSource] ([EntityDocumentID]);

/* SQL text to update entity field related entity name field map for entity field ID F96701F4-70D5-4CB6-A277-6430B51541DE */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='F96701F4-70D5-4CB6-A277-6430B51541DE', @RelatedEntityNameFieldMap='Entity'

/* Index for Foreign Keys for ContentType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AIModelID in table ContentType
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentType_AIModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentType]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentType_AIModelID ON [${flyway:defaultSchema}].[ContentType] ([AIModelID]);

-- Index for foreign key EmbeddingModelID in table ContentType
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentType_EmbeddingModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentType]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentType_EmbeddingModelID ON [${flyway:defaultSchema}].[ContentType] ([EmbeddingModelID]);

-- Index for foreign key VectorIndexID in table ContentType
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentType_VectorIndexID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentType]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentType_VectorIndexID ON [${flyway:defaultSchema}].[ContentType] ([VectorIndexID]);

/* Base View SQL for MJ: Content Source Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Source Types
-- Item: vwContentSourceTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Content Source Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ContentSourceType
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwContentSourceTypes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwContentSourceTypes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwContentSourceTypes]
AS
SELECT
    c.*
FROM
    [${flyway:defaultSchema}].[ContentSourceType] AS c
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentSourceTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Content Source Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Source Types
-- Item: Permissions for vwContentSourceTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwContentSourceTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Content Source Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Source Types
-- Item: spCreateContentSourceType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContentSourceType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateContentSourceType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateContentSourceType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateContentSourceType]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description nvarchar(1000),
    @DriverClass nvarchar(255),
    @Configuration nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ContentSourceType]
            (
                [ID],
                [Name],
                [Description],
                [DriverClass],
                [Configuration]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @DriverClass,
                @Configuration
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ContentSourceType]
            (
                [Name],
                [Description],
                [DriverClass],
                [Configuration]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @DriverClass,
                @Configuration
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwContentSourceTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentSourceType] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Content Source Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentSourceType] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Content Source Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Source Types
-- Item: spUpdateContentSourceType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentSourceType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateContentSourceType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateContentSourceType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateContentSourceType]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(1000),
    @DriverClass nvarchar(255),
    @Configuration nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentSourceType]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [DriverClass] = @DriverClass,
        [Configuration] = @Configuration
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwContentSourceTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwContentSourceTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentSourceType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentSourceType table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateContentSourceType]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateContentSourceType];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateContentSourceType
ON [${flyway:defaultSchema}].[ContentSourceType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentSourceType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ContentSourceType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Content Source Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentSourceType] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for MJ: Content Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Types
-- Item: vwContentTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Content Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ContentType
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwContentTypes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwContentTypes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwContentTypes]
AS
SELECT
    c.*,
    MJAIModel_AIModelID.[Name] AS [AIModel],
    MJAIModel_EmbeddingModelID.[Name] AS [EmbeddingModel],
    MJVectorIndex_VectorIndexID.[Name] AS [VectorIndex]
FROM
    [${flyway:defaultSchema}].[ContentType] AS c
INNER JOIN
    [${flyway:defaultSchema}].[AIModel] AS MJAIModel_AIModelID
  ON
    [c].[AIModelID] = MJAIModel_AIModelID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIModel] AS MJAIModel_EmbeddingModelID
  ON
    [c].[EmbeddingModelID] = MJAIModel_EmbeddingModelID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[VectorIndex] AS MJVectorIndex_VectorIndexID
  ON
    [c].[VectorIndexID] = MJVectorIndex_VectorIndexID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Content Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Types
-- Item: Permissions for vwContentTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwContentTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Content Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Types
-- Item: spCreateContentType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContentType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateContentType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateContentType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateContentType]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @AIModelID uniqueidentifier,
    @MinTags int,
    @MaxTags int,
    @EmbeddingModelID uniqueidentifier,
    @VectorIndexID uniqueidentifier,
    @Configuration nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ContentType]
            (
                [ID],
                [Name],
                [Description],
                [AIModelID],
                [MinTags],
                [MaxTags],
                [EmbeddingModelID],
                [VectorIndexID],
                [Configuration]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @AIModelID,
                @MinTags,
                @MaxTags,
                @EmbeddingModelID,
                @VectorIndexID,
                @Configuration
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ContentType]
            (
                [Name],
                [Description],
                [AIModelID],
                [MinTags],
                [MaxTags],
                [EmbeddingModelID],
                [VectorIndexID],
                [Configuration]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @AIModelID,
                @MinTags,
                @MaxTags,
                @EmbeddingModelID,
                @VectorIndexID,
                @Configuration
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwContentTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentType] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Content Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentType] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Content Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Types
-- Item: spUpdateContentType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateContentType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateContentType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateContentType]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @AIModelID uniqueidentifier,
    @MinTags int,
    @MaxTags int,
    @EmbeddingModelID uniqueidentifier,
    @VectorIndexID uniqueidentifier,
    @Configuration nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentType]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [AIModelID] = @AIModelID,
        [MinTags] = @MinTags,
        [MaxTags] = @MaxTags,
        [EmbeddingModelID] = @EmbeddingModelID,
        [VectorIndexID] = @VectorIndexID,
        [Configuration] = @Configuration
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwContentTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwContentTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentType table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateContentType]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateContentType];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateContentType
ON [${flyway:defaultSchema}].[ContentType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ContentType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Content Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentType] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Content Source Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Source Types
-- Item: spDeleteContentSourceType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentSourceType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteContentSourceType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteContentSourceType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteContentSourceType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ContentSourceType]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentSourceType] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Content Source Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentSourceType] TO [cdp_Integration]



/* spDelete SQL for MJ: Content Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Types
-- Item: spDeleteContentType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteContentType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteContentType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteContentType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ContentType]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentType] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Content Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentType] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID E4284A80-BE82-4FBE-B8C0-5A281CD1FFED */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='E4284A80-BE82-4FBE-B8C0-5A281CD1FFED', @RelatedEntityNameFieldMap='EntityDocument'

/* Base View SQL for MJ: Content Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Sources
-- Item: vwContentSources
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Content Sources
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ContentSource
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwContentSources]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwContentSources];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwContentSources]
AS
SELECT
    c.*,
    MJContentType_ContentTypeID.[Name] AS [ContentType],
    MJContentSourceType_ContentSourceTypeID.[Name] AS [ContentSourceType],
    MJContentFileType_ContentFileTypeID.[Name] AS [ContentFileType],
    MJAIModel_EmbeddingModelID.[Name] AS [EmbeddingModel],
    MJVectorIndex_VectorIndexID.[Name] AS [VectorIndex],
    MJEntity_EntityID.[Name] AS [Entity],
    MJEntityDocument_EntityDocumentID.[Name] AS [EntityDocument]
FROM
    [${flyway:defaultSchema}].[ContentSource] AS c
INNER JOIN
    [${flyway:defaultSchema}].[ContentType] AS MJContentType_ContentTypeID
  ON
    [c].[ContentTypeID] = MJContentType_ContentTypeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[ContentSourceType] AS MJContentSourceType_ContentSourceTypeID
  ON
    [c].[ContentSourceTypeID] = MJContentSourceType_ContentSourceTypeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[ContentFileType] AS MJContentFileType_ContentFileTypeID
  ON
    [c].[ContentFileTypeID] = MJContentFileType_ContentFileTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIModel] AS MJAIModel_EmbeddingModelID
  ON
    [c].[EmbeddingModelID] = MJAIModel_EmbeddingModelID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[VectorIndex] AS MJVectorIndex_VectorIndexID
  ON
    [c].[VectorIndexID] = MJVectorIndex_VectorIndexID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_EntityID
  ON
    [c].[EntityID] = MJEntity_EntityID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[EntityDocument] AS MJEntityDocument_EntityDocumentID
  ON
    [c].[EntityDocumentID] = MJEntityDocument_EntityDocumentID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentSources] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Content Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Sources
-- Item: Permissions for vwContentSources
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwContentSources] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Content Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Sources
-- Item: spCreateContentSource
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContentSource
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateContentSource]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateContentSource];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateContentSource]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @ContentTypeID uniqueidentifier,
    @ContentSourceTypeID uniqueidentifier,
    @ContentFileTypeID uniqueidentifier,
    @URL nvarchar(2000),
    @EmbeddingModelID uniqueidentifier,
    @VectorIndexID uniqueidentifier,
    @Configuration nvarchar(MAX),
    @EntityID uniqueidentifier,
    @EntityDocumentID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ContentSource]
            (
                [ID],
                [Name],
                [ContentTypeID],
                [ContentSourceTypeID],
                [ContentFileTypeID],
                [URL],
                [EmbeddingModelID],
                [VectorIndexID],
                [Configuration],
                [EntityID],
                [EntityDocumentID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @ContentTypeID,
                @ContentSourceTypeID,
                @ContentFileTypeID,
                @URL,
                @EmbeddingModelID,
                @VectorIndexID,
                @Configuration,
                @EntityID,
                @EntityDocumentID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ContentSource]
            (
                [Name],
                [ContentTypeID],
                [ContentSourceTypeID],
                [ContentFileTypeID],
                [URL],
                [EmbeddingModelID],
                [VectorIndexID],
                [Configuration],
                [EntityID],
                [EntityDocumentID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @ContentTypeID,
                @ContentSourceTypeID,
                @ContentFileTypeID,
                @URL,
                @EmbeddingModelID,
                @VectorIndexID,
                @Configuration,
                @EntityID,
                @EntityDocumentID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwContentSources] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentSource] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Content Sources */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentSource] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Content Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Sources
-- Item: spUpdateContentSource
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentSource
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateContentSource]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateContentSource];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateContentSource]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @ContentTypeID uniqueidentifier,
    @ContentSourceTypeID uniqueidentifier,
    @ContentFileTypeID uniqueidentifier,
    @URL nvarchar(2000),
    @EmbeddingModelID uniqueidentifier,
    @VectorIndexID uniqueidentifier,
    @Configuration nvarchar(MAX),
    @EntityID uniqueidentifier,
    @EntityDocumentID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentSource]
    SET
        [Name] = @Name,
        [ContentTypeID] = @ContentTypeID,
        [ContentSourceTypeID] = @ContentSourceTypeID,
        [ContentFileTypeID] = @ContentFileTypeID,
        [URL] = @URL,
        [EmbeddingModelID] = @EmbeddingModelID,
        [VectorIndexID] = @VectorIndexID,
        [Configuration] = @Configuration,
        [EntityID] = @EntityID,
        [EntityDocumentID] = @EntityDocumentID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwContentSources] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwContentSources]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentSource] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentSource table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateContentSource]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateContentSource];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateContentSource
ON [${flyway:defaultSchema}].[ContentSource]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentSource]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ContentSource] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Content Sources */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentSource] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Content Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Sources
-- Item: spDeleteContentSource
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentSource
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteContentSource]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteContentSource];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteContentSource]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ContentSource]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentSource] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Content Sources */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentSource] TO [cdp_Integration]



/* Index for Foreign Keys for TaggedItem */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tagged Items
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key TagID in table TaggedItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TaggedItem_TagID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TaggedItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TaggedItem_TagID ON [${flyway:defaultSchema}].[TaggedItem] ([TagID]);

-- Index for foreign key EntityID in table TaggedItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TaggedItem_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TaggedItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TaggedItem_EntityID ON [${flyway:defaultSchema}].[TaggedItem] ([EntityID]);

/* Base View SQL for MJ: Tagged Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tagged Items
-- Item: vwTaggedItems
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Tagged Items
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  TaggedItem
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwTaggedItems]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwTaggedItems];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwTaggedItems]
AS
SELECT
    t.*,
    MJTag_TagID.[Name] AS [Tag],
    MJEntity_EntityID.[Name] AS [Entity]
FROM
    [${flyway:defaultSchema}].[TaggedItem] AS t
INNER JOIN
    [${flyway:defaultSchema}].[Tag] AS MJTag_TagID
  ON
    [t].[TagID] = MJTag_TagID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_EntityID
  ON
    [t].[EntityID] = MJEntity_EntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwTaggedItems] TO [cdp_UI]

/* Base View Permissions SQL for MJ: Tagged Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tagged Items
-- Item: Permissions for vwTaggedItems
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwTaggedItems] TO [cdp_UI]

/* spCreate SQL for MJ: Tagged Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tagged Items
-- Item: spCreateTaggedItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR TaggedItem
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateTaggedItem]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateTaggedItem];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateTaggedItem]
    @ID uniqueidentifier = NULL,
    @TagID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450),
    @Weight numeric(5, 4) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[TaggedItem]
            (
                [ID],
                [TagID],
                [EntityID],
                [RecordID],
                [Weight]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @TagID,
                @EntityID,
                @RecordID,
                ISNULL(@Weight, 1.0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[TaggedItem]
            (
                [TagID],
                [EntityID],
                [RecordID],
                [Weight]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @TagID,
                @EntityID,
                @RecordID,
                ISNULL(@Weight, 1.0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwTaggedItems] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTaggedItem] TO [cdp_UI]
    

/* spCreate Permissions for MJ: Tagged Items */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTaggedItem] TO [cdp_UI]



/* spUpdate SQL for MJ: Tagged Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tagged Items
-- Item: spUpdateTaggedItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR TaggedItem
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateTaggedItem]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateTaggedItem];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateTaggedItem]
    @ID uniqueidentifier,
    @TagID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450),
    @Weight numeric(5, 4)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TaggedItem]
    SET
        [TagID] = @TagID,
        [EntityID] = @EntityID,
        [RecordID] = @RecordID,
        [Weight] = @Weight
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwTaggedItems] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwTaggedItems]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTaggedItem] TO [cdp_UI]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the TaggedItem table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateTaggedItem]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateTaggedItem];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateTaggedItem
ON [${flyway:defaultSchema}].[TaggedItem]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TaggedItem]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[TaggedItem] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Tagged Items */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTaggedItem] TO [cdp_UI]



/* spDelete SQL for MJ: Tagged Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tagged Items
-- Item: spDeleteTaggedItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TaggedItem
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteTaggedItem]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteTaggedItem];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteTaggedItem]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[TaggedItem]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTaggedItem] TO [cdp_UI]
    

/* spDelete Permissions for MJ: Tagged Items */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTaggedItem] TO [cdp_UI]



/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b31cffa3-4e1d-4886-8d7d-be9652343d41' OR (EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'Entity')) BEGIN
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
            'b31cffa3-4e1d-4886-8d7d-be9652343d41',
            'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Sources
            100037,
            'Entity',
            'Entity',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7ac0e8e9-4886-42a8-9515-9203c9eb3b95' OR (EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'EntityDocument')) BEGIN
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
            '7ac0e8e9-4886-42a8-9515-9203c9eb3b95',
            'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Sources
            100038,
            'EntityDocument',
            'Entity Document',
            NULL,
            'nvarchar',
            500,
            0,
            0,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7eb399ba-e673-4d31-9a84-937ab383d2f2' OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'EntityRecordDocument')) BEGIN
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
            '7eb399ba-e673-4d31-9a84-937ab383d2f2',
            'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Items
            100035,
            'EntityRecordDocument',
            'Entity Record Document',
            NULL,
            'nvarchar',
            900,
            0,
            0,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dc4d27f2-bdd6-47d1-9da4-15a7fa547d5e' OR (EntityID = 'F63EC656-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'Tag_Virtual')) BEGIN
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
            'dc4d27f2-bdd6-47d1-9da4-15a7fa547d5e',
            'F63EC656-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Item Tags
            100017,
            'Tag_Virtual',
            'Tag Virtual',
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
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'B31CFFA3-4E1D-4886-8D7D-BE9652343D41'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'EBB8433E-F36B-1410-867F-007B559E242F'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F7B8433E-F36B-1410-867F-007B559E242F'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'CDB8433E-F36B-1410-867F-007B559E242F'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'EBB8433E-F36B-1410-867F-007B559E242F'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '0BD076E0-A5D2-4AF8-B9A7-646D342DBEF4'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '064AA602-A3D4-4192-88C4-6F96EFDF0F18'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'E660536A-6990-4E69-B2FF-EDED2F11AFE9'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'E660536A-6990-4E69-B2FF-EDED2F11AFE9'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set categories for 9 fields */

-- UPDATE Entity Field Category Info MJ: Content Item Tags.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '27B9433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Item Tags.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '39B9433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Item Tags.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3FB9433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Item Tags.ItemID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Item',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2DB9433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Item Tags.Item 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Item Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8D73962B-3D7D-489E-837F-732C90578325' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Item Tags.Tag 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Tag Text',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '33B9433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Item Tags.TagID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Tag Association',
   GeneratedFormSection = 'Category',
   DisplayName = 'Tag Reference',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E47C091D-60AE-4E36-9E13-6AD8422C0BBA' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Item Tags.Weight 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2EF1276A-D856-4408-A72A-BE0907ABCA75' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Item Tags.Tag_Virtual 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Tag Association',
   GeneratedFormSection = 'Category',
   DisplayName = 'Tag (Virtual)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DC4D27F2-BDD6-47D1-9DA4-15A7FA547D5E' AND AutoUpdateCategory = 1

/* Set categories for 20 fields */

-- UPDATE Entity Field Category Info MJ: Content Sources.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A1B7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C5B7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CBB7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A7B7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.ContentSourceTypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Source Type',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B3B7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.ContentSourceType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Source Type Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FBB09B21-50A3-4CCE-A114-44B0C9835251' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.URL 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'URL',
   CodeType = NULL
WHERE 
   ID = 'BFB7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.ContentTypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'ADB7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.ContentType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Content Type Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8E282AD9-2695-4F04-AC1F-79A5380D4E4D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.ContentFileTypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'File Type',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B9B7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.ContentFileType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'File Type Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'ABA84E45-FDE6-4FD0-ACC9-BDA83A8CDE17' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.EmbeddingModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '045043FD-61A9-477F-82A7-72A7FC615A3C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.EmbeddingModel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Embedding Model Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '12DE0FA4-7538-42BE-9C11-7638B15B2D78' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.VectorIndexID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '11091434-73BD-4006-8C65-8639EA9AF1F3' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.VectorIndex 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Vector Index Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9CA2DC63-66EC-405B-9974-81FD5129B693' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.Configuration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Configuration JSON',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '932EE746-F4E7-4036-92B0-733D799C2FBB' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.EntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Source Entity',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F96701F4-70D5-4CB6-A277-6430B51541DE' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.Entity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Source Entity Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B31CFFA3-4E1D-4886-8D7D-BE9652343D41' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.EntityDocumentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Document Template',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E4284A80-BE82-4FBE-B8C0-5A281CD1FFED' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.EntityDocument 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Document Template Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7AC0E8E9-4886-42A8-9515-9203C9EB3B95' AND AutoUpdateCategory = 1

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].[EntitySetting]
               SET Value = '{"Source Configuration":{"icon":"fa fa-sliders-h","description":"Advanced settings and entity mappings for fine-tuning content ingestion and processing."}}', __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'FieldCategoryInfo'
            

/* Update FieldCategoryIcons setting (legacy) */

               UPDATE [${flyway:defaultSchema}].[EntitySetting]
               SET Value = '{"Source Configuration":"fa fa-sliders-h"}', __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 18 fields */

-- UPDATE Entity Field Category Info MJ: Content Items.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BBB8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.ContentSourceID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Information',
   GeneratedFormSection = 'Category',
   DisplayName = 'Content Source',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C1B8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.ContentSource 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Content Source Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0BD076E0-A5D2-4AF8-B9A7-646D342DBEF4' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.ContentSourceTypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Information',
   GeneratedFormSection = 'Category',
   DisplayName = 'Content Source Type',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D9B8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.ContentSourceType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Content Source Type Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EFA43D7E-C671-48A6-8733-8B75CA8B3CC1' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.ContentFileTypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Information',
   GeneratedFormSection = 'Category',
   DisplayName = 'Content File Type',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DFB8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.ContentFileType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Content File Type Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E13CB38F-1FB7-439C-A962-ED7F91DE0BFF' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.URL 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Information',
   GeneratedFormSection = 'Category',
   ExtendedType = 'URL',
   CodeType = NULL
WHERE 
   ID = 'EBB8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Content Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C7B8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Content Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CDB8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.ContentTypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Content Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Content Type',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D3B8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.ContentType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Content Type Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '064AA602-A3D4-4192-88C4-6F96EFDF0F18' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.Checksum 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Content Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E5B8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.Text 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Extracted Content',
   GeneratedFormSection = 'Category',
   DisplayName = 'Extracted Text',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F1B8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.EntityRecordDocumentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Extracted Content',
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity Record Document',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DFE539D5-8EB6-44F9-8B56-47110E540579' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.EntityRecordDocument 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Extracted Content',
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity Record Document Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7EB399BA-E673-4D31-9A84-937AB383D2F2' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F7B8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FDB8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('33d288d6-daa5-4029-96d9-d8697a960599', 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 'FieldCategoryInfo', '{"Extracted Content":{"icon":"fa fa-file-alt","description":"The actual extracted text payload and references to the source document snapshots."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit fields and technical identifiers."}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting (legacy) */

               UPDATE [${flyway:defaultSchema}].[EntitySetting]
               SET Value = '{"Extracted Content":"fa fa-file-alt","System Metadata":"fa fa-cog"}', __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 14 fields */

-- UPDATE Entity Field Category Info MJ: Content Types.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '43B8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Types.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '49B8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Types.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4FB8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Types.Configuration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Content Type Details',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'D2E39013-5C05-4B67-B415-C5F8F43220AA' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Types.AIModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '55B8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Types.AIModel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'ADDF8AC9-BF3A-4ECB-AF21-5C04DA27C396' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Types.EmbeddingModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0706EBD4-7D99-4F16-99DF-0E398E319AA3' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Types.EmbeddingModel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BAAB3CB5-ACCB-4594-BC69-8031EDBF0AA7' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Types.VectorIndexID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '93D4F3C4-3110-41CD-85FD-7A6A2C28B2A4' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Types.VectorIndex 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3C4FEC28-2617-418E-B476-09722B4A0858' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Types.MinTags 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5BB8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Types.MaxTags 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '61B8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Types.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '67B8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Types.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6DB8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

/* Set categories for 7 fields */

-- UPDATE Entity Field Category Info MJ: Content Source Types.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F5B7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Source Types.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Type Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FBB7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Source Types.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Type Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '01B8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Source Types.DriverClass 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Type Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E660536A-6990-4E69-B2FF-EDED2F11AFE9' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Source Types.Configuration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Type Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '933AB75A-674F-46C8-A471-40D648208F94' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Source Types.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '07B8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Source Types.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0DB8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('ec9bdd37-eedb-4a9a-b50b-7f14014e961b', 'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 'FieldCategoryInfo', '{"Source Type Configuration":{"icon":"fa fa-sliders-h","description":"Core definition and technical settings for the content source type including driver implementation."},"System Metadata":{"icon":"fa fa-database","description":"System-managed audit and tracking fields."}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting (legacy) */

               UPDATE [${flyway:defaultSchema}].[EntitySetting]
               SET Value = '{"Source Type Configuration":"fa fa-sliders-h","System Metadata":"fa fa-database"}', __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'FieldCategoryIcons'
            

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '4D458C41-0728-4544-AF26-510EF88CFFAE'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '334317F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '684317F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'FF4E17F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set categories for 9 fields */

-- UPDATE Entity Field Category Info MJ: Tagged Items.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '304317F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tagged Items.TagID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Tag',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '314317F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tagged Items.Tag 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Tag Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '684317F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tagged Items.Weight 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Tag Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4D458C41-0728-4544-AF26-510EF88CFFAE' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tagged Items.EntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '324317F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tagged Items.RecordID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '334317F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tagged Items.Entity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FF4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tagged Items.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BC5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tagged Items.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BD5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

