-- Migration: Add EntityOrganicKey and EntityOrganicKeyRelatedEntity tables
-- Description: Introduces "Organic Keys" — cross-entity relationships based on shared
--              business data (email, phone, SSN, etc.) rather than foreign key references.
--              Enables automatic "related records" views across integration boundaries.

-- Table 1: EntityOrganicKey
-- Defines an organic key on an entity — the set of fields that constitute a natural
-- identifier for cross-system matching.
CREATE TABLE ${flyway:defaultSchema}.EntityOrganicKey (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    EntityID UNIQUEIDENTIFIER NOT NULL,
    Name NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    MatchFieldNames NVARCHAR(500) NOT NULL,
    NormalizationStrategy NVARCHAR(50) NOT NULL DEFAULT 'LowerCaseTrim',
    CustomNormalizationExpression NVARCHAR(MAX) NULL,
    AutoCreateRelatedViewOnForm BIT NOT NULL DEFAULT 0,
    Sequence INT NOT NULL DEFAULT 0,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Active',
    CONSTRAINT PK_EntityOrganicKey PRIMARY KEY (ID),
    CONSTRAINT FK_EntityOrganicKey_Entity FOREIGN KEY (EntityID)
        REFERENCES ${flyway:defaultSchema}.Entity(ID),
    CONSTRAINT UQ_EntityOrganicKey_EntityName UNIQUE (EntityID, Name),
    CONSTRAINT CK_EntityOrganicKey_NormalizationStrategy
        CHECK (NormalizationStrategy IN ('LowerCaseTrim', 'Trim', 'ExactMatch', 'Custom')),
    CONSTRAINT CK_EntityOrganicKey_Status
        CHECK (Status IN ('Active', 'Disabled'))
);

-- Extended properties for EntityOrganicKey (table-level)
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Defines organic keys on entities — sets of fields that constitute natural identifiers for cross-system matching (e.g., email, phone, SSN). Enables related record views across integration boundaries without foreign keys.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'EntityOrganicKey';

-- Extended properties for EntityOrganicKey (column-level)
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Human-readable label for this organic key (e.g., "Email Match", "SSN Match"). Must be unique per entity.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'EntityOrganicKey',
    @level2type=N'COLUMN', @level2name=N'Name';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Optional explanation of the key''s purpose and matching semantics.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'EntityOrganicKey',
    @level2type=N'COLUMN', @level2name=N'Description';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Comma-delimited field names in the owning entity that constitute the key. Single value for simple keys (e.g., "EmailAddress"), multiple for compound keys (e.g., "FirstName,LastName,DateOfBirth"). Field names must match EntityField.Name values.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'EntityOrganicKey',
    @level2type=N'COLUMN', @level2name=N'MatchFieldNames';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'How field values are normalized before comparison. LowerCaseTrim = LOWER(TRIM(x)), Trim = TRIM(x), ExactMatch = no transformation, Custom = uses CustomNormalizationExpression.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'EntityOrganicKey',
    @level2type=N'COLUMN', @level2name=N'NormalizationStrategy';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'SQL expression template when NormalizationStrategy is Custom. Uses {{FieldName}} as placeholder. Example: "REPLACE(REPLACE({{FieldName}}, ''-'', ''''), '' '', '''')" for phone number normalization.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'EntityOrganicKey',
    @level2type=N'COLUMN', @level2name=N'CustomNormalizationExpression';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When true, a future discovery process will automatically scan entities and create EntityOrganicKeyRelatedEntity rows for entities with matching field patterns.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'EntityOrganicKey',
    @level2type=N'COLUMN', @level2name=N'AutoCreateRelatedViewOnForm';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Ordering when an entity has multiple organic keys. Lower values = higher priority.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'EntityOrganicKey',
    @level2type=N'COLUMN', @level2name=N'Sequence';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Active or Disabled. Disabled keys are ignored at runtime.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'EntityOrganicKey',
    @level2type=N'COLUMN', @level2name=N'Status';

-- Table 2: EntityOrganicKeyRelatedEntity
-- Maps a related entity to an organic key, supporting both direct field matching
-- and transitive matching via a SQL view/table.
CREATE TABLE ${flyway:defaultSchema}.EntityOrganicKeyRelatedEntity (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    EntityOrganicKeyID UNIQUEIDENTIFIER NOT NULL,
    RelatedEntityID UNIQUEIDENTIFIER NOT NULL,
    RelatedEntityFieldNames NVARCHAR(500) NULL,
    TransitiveObjectName NVARCHAR(500) NULL,
    TransitiveObjectMatchFieldNames NVARCHAR(500) NULL,
    TransitiveObjectOutputFieldName NVARCHAR(255) NULL,
    RelatedEntityJoinFieldName NVARCHAR(255) NULL,
    DisplayName NVARCHAR(255) NULL,
    DisplayLocation NVARCHAR(50) NOT NULL DEFAULT 'After Field Tabs',
    DisplayComponentID UNIQUEIDENTIFIER NULL,
    DisplayComponentConfiguration NVARCHAR(MAX) NULL,
    Sequence INT NOT NULL DEFAULT 0,
    CONSTRAINT PK_EntityOrganicKeyRelatedEntity PRIMARY KEY (ID),
    CONSTRAINT FK_EOKRE_OrganicKey FOREIGN KEY (EntityOrganicKeyID)
        REFERENCES ${flyway:defaultSchema}.EntityOrganicKey(ID),
    CONSTRAINT FK_EOKRE_RelatedEntity FOREIGN KEY (RelatedEntityID)
        REFERENCES ${flyway:defaultSchema}.Entity(ID),
    CONSTRAINT UQ_EOKRE_KeyEntity UNIQUE (EntityOrganicKeyID, RelatedEntityID),
    CONSTRAINT CK_EOKRE_DisplayLocation
        CHECK (DisplayLocation IN ('After Field Tabs', 'Before Field Tabs')),
    CONSTRAINT CK_EOKRE_MatchMode CHECK (
        -- Either direct match (RelatedEntityFieldNames set, no transitive columns)
        (RelatedEntityFieldNames IS NOT NULL
            AND TransitiveObjectName IS NULL
            AND TransitiveObjectMatchFieldNames IS NULL
            AND TransitiveObjectOutputFieldName IS NULL
            AND RelatedEntityJoinFieldName IS NULL)
        OR
        -- Or transitive match (all transitive columns set, no RelatedEntityFieldNames)
        (RelatedEntityFieldNames IS NULL
            AND TransitiveObjectName IS NOT NULL
            AND TransitiveObjectMatchFieldNames IS NOT NULL
            AND TransitiveObjectOutputFieldName IS NOT NULL
            AND RelatedEntityJoinFieldName IS NOT NULL)
    )
);

-- Extended properties for EntityOrganicKeyRelatedEntity (table-level)
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Maps a related entity to an organic key, defining how records are matched — either by direct field comparison or transitively via a SQL view/table that bridges multiple hops.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'EntityOrganicKeyRelatedEntity';

-- Extended properties for EntityOrganicKeyRelatedEntity (column-level)
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Comma-delimited field names in the related entity, positionally matching MatchFieldNames on the parent key. NULL when using transitive matching.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'EntityOrganicKeyRelatedEntity',
    @level2type=N'COLUMN', @level2name=N'RelatedEntityFieldNames';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Schema-qualified name of a SQL view or table that bridges the organic key to the related entity (e.g., "dbo.vwContactRecipientBridge"). This object encapsulates any number of join hops. NULL for direct matches.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'EntityOrganicKeyRelatedEntity',
    @level2type=N'COLUMN', @level2name=N'TransitiveObjectName';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Comma-delimited field names in the transitive object that match the organic key values, positionally aligned with MatchFieldNames. NULL for direct matches.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'EntityOrganicKeyRelatedEntity',
    @level2type=N'COLUMN', @level2name=N'TransitiveObjectMatchFieldNames';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The field in the transitive object that produces the value to join against the related entity. NULL for direct matches.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'EntityOrganicKeyRelatedEntity',
    @level2type=N'COLUMN', @level2name=N'TransitiveObjectOutputFieldName';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The field in the related entity that matches TransitiveObjectOutputFieldName. NULL for direct matches.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'EntityOrganicKeyRelatedEntity',
    @level2type=N'COLUMN', @level2name=N'RelatedEntityJoinFieldName';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Tab/section label override. If NULL, defaults to the related entity''s display name.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'EntityOrganicKeyRelatedEntity',
    @level2type=N'COLUMN', @level2name=N'DisplayName';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Where to render the organic key tab relative to FK relationship tabs. After Field Tabs or Before Field Tabs.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'EntityOrganicKeyRelatedEntity',
    @level2type=N'COLUMN', @level2name=N'DisplayLocation';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'FK to component registry for a custom display component. NULL uses the default EntityDataGrid.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'EntityOrganicKeyRelatedEntity',
    @level2type=N'COLUMN', @level2name=N'DisplayComponentID';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON configuration passed to the display component.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'EntityOrganicKeyRelatedEntity',
    @level2type=N'COLUMN', @level2name=N'DisplayComponentConfiguration';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Tab ordering within this organic key''s related entities. Lower values appear first.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'EntityOrganicKeyRelatedEntity',
    @level2type=N'COLUMN', @level2name=N'Sequence';















































-- CODE GEN RUN
/* SQL generated to create new entity MJ: Entity Organic Keys */

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
         [AllowUserSearchAPI]
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
         '03716ac0-1509-471c-9159-c67d1be6971e',
         'MJ: Entity Organic Keys',
         'Entity Organic Keys',
         'Defines organic keys on entities — sets of fields that constitute natural identifiers for cross-system matching (e.g., email, phone, SSN). Enables related record views across integration boundaries without foreign keys.',
         NULL,
         'EntityOrganicKey',
         'vwEntityOrganicKeys',
         '${flyway:defaultSchema}',
         1,
         0
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
      )
   

/* SQL generated to add new entity MJ: Entity Organic Keys to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '03716ac0-1509-471c-9159-c67d1be6971e', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Entity Organic Keys for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('03716ac0-1509-471c-9159-c67d1be6971e', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Entity Organic Keys for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('03716ac0-1509-471c-9159-c67d1be6971e', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Entity Organic Keys for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('03716ac0-1509-471c-9159-c67d1be6971e', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

/* SQL generated to create new entity MJ: Entity Organic Key Related Entities */

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
         [AllowUserSearchAPI]
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
         'ed243f59-106c-4020-a334-5bad0ccf7987',
         'MJ: Entity Organic Key Related Entities',
         'Entity Organic Key Related Entities',
         'Maps a related entity to an organic key, defining how records are matched — either by direct field comparison or transitively via a SQL view/table that bridges multiple hops.',
         NULL,
         'EntityOrganicKeyRelatedEntity',
         'vwEntityOrganicKeyRelatedEntities',
         '${flyway:defaultSchema}',
         1,
         0
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
      )
   

/* SQL generated to add new entity MJ: Entity Organic Key Related Entities to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'ed243f59-106c-4020-a334-5bad0ccf7987', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Entity Organic Key Related Entities for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('ed243f59-106c-4020-a334-5bad0ccf7987', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Entity Organic Key Related Entities for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('ed243f59-106c-4020-a334-5bad0ccf7987', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Entity Organic Key Related Entities for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('ed243f59-106c-4020-a334-5bad0ccf7987', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.EntityOrganicKeyRelatedEntity */
ALTER TABLE [${flyway:defaultSchema}].[EntityOrganicKeyRelatedEntity] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.EntityOrganicKeyRelatedEntity */
UPDATE [${flyway:defaultSchema}].[EntityOrganicKeyRelatedEntity] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.EntityOrganicKeyRelatedEntity */
ALTER TABLE [${flyway:defaultSchema}].[EntityOrganicKeyRelatedEntity] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.EntityOrganicKeyRelatedEntity */
ALTER TABLE [${flyway:defaultSchema}].[EntityOrganicKeyRelatedEntity] ADD CONSTRAINT [DF___mj_EntityOrganicKeyRelatedEntity___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt]

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.EntityOrganicKeyRelatedEntity */
ALTER TABLE [${flyway:defaultSchema}].[EntityOrganicKeyRelatedEntity] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.EntityOrganicKeyRelatedEntity */
UPDATE [${flyway:defaultSchema}].[EntityOrganicKeyRelatedEntity] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.EntityOrganicKeyRelatedEntity */
ALTER TABLE [${flyway:defaultSchema}].[EntityOrganicKeyRelatedEntity] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.EntityOrganicKeyRelatedEntity */
ALTER TABLE [${flyway:defaultSchema}].[EntityOrganicKeyRelatedEntity] ADD CONSTRAINT [DF___mj_EntityOrganicKeyRelatedEntity___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt]

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.EntityOrganicKey */
ALTER TABLE [${flyway:defaultSchema}].[EntityOrganicKey] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.EntityOrganicKey */
UPDATE [${flyway:defaultSchema}].[EntityOrganicKey] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.EntityOrganicKey */
ALTER TABLE [${flyway:defaultSchema}].[EntityOrganicKey] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.EntityOrganicKey */
ALTER TABLE [${flyway:defaultSchema}].[EntityOrganicKey] ADD CONSTRAINT [DF___mj_EntityOrganicKey___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt]

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.EntityOrganicKey */
ALTER TABLE [${flyway:defaultSchema}].[EntityOrganicKey] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.EntityOrganicKey */
UPDATE [${flyway:defaultSchema}].[EntityOrganicKey] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.EntityOrganicKey */
ALTER TABLE [${flyway:defaultSchema}].[EntityOrganicKey] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.EntityOrganicKey */
ALTER TABLE [${flyway:defaultSchema}].[EntityOrganicKey] ADD CONSTRAINT [DF___mj_EntityOrganicKey___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt]

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '83983333-ad6b-4979-94c1-54d11a0f230d' OR (EntityID = 'ED243F59-106C-4020-A334-5BAD0CCF7987' AND Name = 'ID')) BEGIN
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
            '83983333-ad6b-4979-94c1-54d11a0f230d',
            'ED243F59-106C-4020-A334-5BAD0CCF7987', -- Entity: MJ: Entity Organic Key Related Entities
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8823d767-db27-4f35-b204-f585085cf840' OR (EntityID = 'ED243F59-106C-4020-A334-5BAD0CCF7987' AND Name = 'EntityOrganicKeyID')) BEGIN
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
            '8823d767-db27-4f35-b204-f585085cf840',
            'ED243F59-106C-4020-A334-5BAD0CCF7987', -- Entity: MJ: Entity Organic Key Related Entities
            100002,
            'EntityOrganicKeyID',
            'Entity Organic Key ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            '03716AC0-1509-471C-9159-C67D1BE6971E',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fbd92aee-b9a9-4ffe-9afd-23d08e2b9158' OR (EntityID = 'ED243F59-106C-4020-A334-5BAD0CCF7987' AND Name = 'RelatedEntityID')) BEGIN
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
            'fbd92aee-b9a9-4ffe-9afd-23d08e2b9158',
            'ED243F59-106C-4020-A334-5BAD0CCF7987', -- Entity: MJ: Entity Organic Key Related Entities
            100003,
            'RelatedEntityID',
            'Related Entity ID',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '79ab1e17-d3f7-4b12-839a-0e96ddd9bf7d' OR (EntityID = 'ED243F59-106C-4020-A334-5BAD0CCF7987' AND Name = 'RelatedEntityFieldNames')) BEGIN
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
            '79ab1e17-d3f7-4b12-839a-0e96ddd9bf7d',
            'ED243F59-106C-4020-A334-5BAD0CCF7987', -- Entity: MJ: Entity Organic Key Related Entities
            100004,
            'RelatedEntityFieldNames',
            'Related Entity Field Names',
            'Comma-delimited field names in the related entity, positionally matching MatchFieldNames on the parent key. NULL when using transitive matching.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b26c64a0-d7fe-4a76-820b-7ecb2420ccce' OR (EntityID = 'ED243F59-106C-4020-A334-5BAD0CCF7987' AND Name = 'TransitiveObjectName')) BEGIN
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
            'b26c64a0-d7fe-4a76-820b-7ecb2420ccce',
            'ED243F59-106C-4020-A334-5BAD0CCF7987', -- Entity: MJ: Entity Organic Key Related Entities
            100005,
            'TransitiveObjectName',
            'Transitive Object Name',
            'Schema-qualified name of a SQL view or table that bridges the organic key to the related entity (e.g., "dbo.vwContactRecipientBridge"). This object encapsulates any number of join hops. NULL for direct matches.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c50caa30-df0c-4d4a-bc24-772a0bb1cd7a' OR (EntityID = 'ED243F59-106C-4020-A334-5BAD0CCF7987' AND Name = 'TransitiveObjectMatchFieldNames')) BEGIN
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
            'c50caa30-df0c-4d4a-bc24-772a0bb1cd7a',
            'ED243F59-106C-4020-A334-5BAD0CCF7987', -- Entity: MJ: Entity Organic Key Related Entities
            100006,
            'TransitiveObjectMatchFieldNames',
            'Transitive Object Match Field Names',
            'Comma-delimited field names in the transitive object that match the organic key values, positionally aligned with MatchFieldNames. NULL for direct matches.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '97aaf30c-7b7d-4b42-abd6-35b8b73d4d4d' OR (EntityID = 'ED243F59-106C-4020-A334-5BAD0CCF7987' AND Name = 'TransitiveObjectOutputFieldName')) BEGIN
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
            '97aaf30c-7b7d-4b42-abd6-35b8b73d4d4d',
            'ED243F59-106C-4020-A334-5BAD0CCF7987', -- Entity: MJ: Entity Organic Key Related Entities
            100007,
            'TransitiveObjectOutputFieldName',
            'Transitive Object Output Field Name',
            'The field in the transitive object that produces the value to join against the related entity. NULL for direct matches.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5346851e-131c-48c7-bebc-2562f358a90f' OR (EntityID = 'ED243F59-106C-4020-A334-5BAD0CCF7987' AND Name = 'RelatedEntityJoinFieldName')) BEGIN
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
            '5346851e-131c-48c7-bebc-2562f358a90f',
            'ED243F59-106C-4020-A334-5BAD0CCF7987', -- Entity: MJ: Entity Organic Key Related Entities
            100008,
            'RelatedEntityJoinFieldName',
            'Related Entity Join Field Name',
            'The field in the related entity that matches TransitiveObjectOutputFieldName. NULL for direct matches.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd864a352-8165-4918-91c0-938488d9aab3' OR (EntityID = 'ED243F59-106C-4020-A334-5BAD0CCF7987' AND Name = 'DisplayName')) BEGIN
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
            'd864a352-8165-4918-91c0-938488d9aab3',
            'ED243F59-106C-4020-A334-5BAD0CCF7987', -- Entity: MJ: Entity Organic Key Related Entities
            100009,
            'DisplayName',
            'Display Name',
            'Tab/section label override. If NULL, defaults to the related entity''s display name.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '608206c5-ace6-4f97-8656-56fbbb99f9bf' OR (EntityID = 'ED243F59-106C-4020-A334-5BAD0CCF7987' AND Name = 'DisplayLocation')) BEGIN
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
            '608206c5-ace6-4f97-8656-56fbbb99f9bf',
            'ED243F59-106C-4020-A334-5BAD0CCF7987', -- Entity: MJ: Entity Organic Key Related Entities
            100010,
            'DisplayLocation',
            'Display Location',
            'Where to render the organic key tab relative to FK relationship tabs. After Field Tabs or Before Field Tabs.',
            'nvarchar',
            100,
            0,
            0,
            0,
            'After Field Tabs',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '97087b14-68a4-4eec-9ba6-ac1de795c552' OR (EntityID = 'ED243F59-106C-4020-A334-5BAD0CCF7987' AND Name = 'DisplayComponentID')) BEGIN
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
            '97087b14-68a4-4eec-9ba6-ac1de795c552',
            'ED243F59-106C-4020-A334-5BAD0CCF7987', -- Entity: MJ: Entity Organic Key Related Entities
            100011,
            'DisplayComponentID',
            'Display Component ID',
            'FK to component registry for a custom display component. NULL uses the default EntityDataGrid.',
            'uniqueidentifier',
            16,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '85caed4a-9f18-4b6e-a5fd-1f968ff3a53a' OR (EntityID = 'ED243F59-106C-4020-A334-5BAD0CCF7987' AND Name = 'DisplayComponentConfiguration')) BEGIN
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
            '85caed4a-9f18-4b6e-a5fd-1f968ff3a53a',
            'ED243F59-106C-4020-A334-5BAD0CCF7987', -- Entity: MJ: Entity Organic Key Related Entities
            100012,
            'DisplayComponentConfiguration',
            'Display Component Configuration',
            'JSON configuration passed to the display component.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '96d996f0-ef09-4acf-adc8-67635eb4f0c6' OR (EntityID = 'ED243F59-106C-4020-A334-5BAD0CCF7987' AND Name = 'Sequence')) BEGIN
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
            '96d996f0-ef09-4acf-adc8-67635eb4f0c6',
            'ED243F59-106C-4020-A334-5BAD0CCF7987', -- Entity: MJ: Entity Organic Key Related Entities
            100013,
            'Sequence',
            'Sequence',
            'Tab ordering within this organic key''s related entities. Lower values appear first.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4d0e6469-e42c-4b1c-88d3-1fd33b07e253' OR (EntityID = 'ED243F59-106C-4020-A334-5BAD0CCF7987' AND Name = '__mj_CreatedAt')) BEGIN
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
            '4d0e6469-e42c-4b1c-88d3-1fd33b07e253',
            'ED243F59-106C-4020-A334-5BAD0CCF7987', -- Entity: MJ: Entity Organic Key Related Entities
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a6ac76c8-59e4-4978-bad6-5f9fbcbfe649' OR (EntityID = 'ED243F59-106C-4020-A334-5BAD0CCF7987' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'a6ac76c8-59e4-4978-bad6-5f9fbcbfe649',
            'ED243F59-106C-4020-A334-5BAD0CCF7987', -- Entity: MJ: Entity Organic Key Related Entities
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bd963c32-d465-47d2-b08b-1a21dfc1e577' OR (EntityID = '03716AC0-1509-471C-9159-C67D1BE6971E' AND Name = 'ID')) BEGIN
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
            'bd963c32-d465-47d2-b08b-1a21dfc1e577',
            '03716AC0-1509-471C-9159-C67D1BE6971E', -- Entity: MJ: Entity Organic Keys
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9e5658b0-59ab-49c9-bc9f-efd91c00a789' OR (EntityID = '03716AC0-1509-471C-9159-C67D1BE6971E' AND Name = 'EntityID')) BEGIN
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
            '9e5658b0-59ab-49c9-bc9f-efd91c00a789',
            '03716AC0-1509-471C-9159-C67D1BE6971E', -- Entity: MJ: Entity Organic Keys
            100002,
            'EntityID',
            'Entity ID',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cd56f3e1-ed5f-43e0-b5bf-d34e268f3e6b' OR (EntityID = '03716AC0-1509-471C-9159-C67D1BE6971E' AND Name = 'Name')) BEGIN
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
            'cd56f3e1-ed5f-43e0-b5bf-d34e268f3e6b',
            '03716AC0-1509-471C-9159-C67D1BE6971E', -- Entity: MJ: Entity Organic Keys
            100003,
            'Name',
            'Name',
            'Human-readable label for this organic key (e.g., "Email Match", "SSN Match"). Must be unique per entity.',
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
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'db3a2c89-6e45-4a78-8bde-3e222b5ab2c7' OR (EntityID = '03716AC0-1509-471C-9159-C67D1BE6971E' AND Name = 'Description')) BEGIN
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
            'db3a2c89-6e45-4a78-8bde-3e222b5ab2c7',
            '03716AC0-1509-471C-9159-C67D1BE6971E', -- Entity: MJ: Entity Organic Keys
            100004,
            'Description',
            'Description',
            'Optional explanation of the key''s purpose and matching semantics.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9c395cf1-c60d-485e-926f-894bc1f43ac8' OR (EntityID = '03716AC0-1509-471C-9159-C67D1BE6971E' AND Name = 'MatchFieldNames')) BEGIN
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
            '9c395cf1-c60d-485e-926f-894bc1f43ac8',
            '03716AC0-1509-471C-9159-C67D1BE6971E', -- Entity: MJ: Entity Organic Keys
            100005,
            'MatchFieldNames',
            'Match Field Names',
            'Comma-delimited field names in the owning entity that constitute the key. Single value for simple keys (e.g., "EmailAddress"), multiple for compound keys (e.g., "FirstName,LastName,DateOfBirth"). Field names must match EntityField.Name values.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '93fa954e-8112-435f-a544-f9c91534b64b' OR (EntityID = '03716AC0-1509-471C-9159-C67D1BE6971E' AND Name = 'NormalizationStrategy')) BEGIN
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
            '93fa954e-8112-435f-a544-f9c91534b64b',
            '03716AC0-1509-471C-9159-C67D1BE6971E', -- Entity: MJ: Entity Organic Keys
            100006,
            'NormalizationStrategy',
            'Normalization Strategy',
            'How field values are normalized before comparison. LowerCaseTrim = LOWER(TRIM(x)), Trim = TRIM(x), ExactMatch = no transformation, Custom = uses CustomNormalizationExpression.',
            'nvarchar',
            100,
            0,
            0,
            0,
            'LowerCaseTrim',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6cde899d-3a4f-4b24-b566-9d8ab7445c06' OR (EntityID = '03716AC0-1509-471C-9159-C67D1BE6971E' AND Name = 'CustomNormalizationExpression')) BEGIN
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
            '6cde899d-3a4f-4b24-b566-9d8ab7445c06',
            '03716AC0-1509-471C-9159-C67D1BE6971E', -- Entity: MJ: Entity Organic Keys
            100007,
            'CustomNormalizationExpression',
            'Custom Normalization Expression',
            'SQL expression template when NormalizationStrategy is Custom. Uses {{FieldName}} as placeholder. Example: "REPLACE(REPLACE({{FieldName}}, ''-'', ''''), '' '', '''')" for phone number normalization.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ffcb358c-c3a6-43a3-ad6f-cc8e5edc85db' OR (EntityID = '03716AC0-1509-471C-9159-C67D1BE6971E' AND Name = 'AutoCreateRelatedViewOnForm')) BEGIN
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
            'ffcb358c-c3a6-43a3-ad6f-cc8e5edc85db',
            '03716AC0-1509-471C-9159-C67D1BE6971E', -- Entity: MJ: Entity Organic Keys
            100008,
            'AutoCreateRelatedViewOnForm',
            'Auto Create Related View On Form',
            'When true, a future discovery process will automatically scan entities and create EntityOrganicKeyRelatedEntity rows for entities with matching field patterns.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e15be827-03ea-478c-a8ac-07510c14b69c' OR (EntityID = '03716AC0-1509-471C-9159-C67D1BE6971E' AND Name = 'Sequence')) BEGIN
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
            'e15be827-03ea-478c-a8ac-07510c14b69c',
            '03716AC0-1509-471C-9159-C67D1BE6971E', -- Entity: MJ: Entity Organic Keys
            100009,
            'Sequence',
            'Sequence',
            'Ordering when an entity has multiple organic keys. Lower values = higher priority.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7bf9464a-ae37-4710-983e-666806542ab6' OR (EntityID = '03716AC0-1509-471C-9159-C67D1BE6971E' AND Name = 'Status')) BEGIN
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
            '7bf9464a-ae37-4710-983e-666806542ab6',
            '03716AC0-1509-471C-9159-C67D1BE6971E', -- Entity: MJ: Entity Organic Keys
            100010,
            'Status',
            'Status',
            'Active or Disabled. Disabled keys are ignored at runtime.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Active',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '71dba4a8-0884-4914-915a-c191e40aa1a1' OR (EntityID = '03716AC0-1509-471C-9159-C67D1BE6971E' AND Name = '__mj_CreatedAt')) BEGIN
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
            '71dba4a8-0884-4914-915a-c191e40aa1a1',
            '03716AC0-1509-471C-9159-C67D1BE6971E', -- Entity: MJ: Entity Organic Keys
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '30c05840-bd02-41d7-84df-de9a8718ce98' OR (EntityID = '03716AC0-1509-471C-9159-C67D1BE6971E' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '30c05840-bd02-41d7-84df-de9a8718ce98',
            '03716AC0-1509-471C-9159-C67D1BE6971E', -- Entity: MJ: Entity Organic Keys
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

/* SQL text to insert entity field value with ID d3650e04-c312-4997-b437-d63512d4b4f5 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d3650e04-c312-4997-b437-d63512d4b4f5', '93FA954E-8112-435F-A544-F9C91534B64B', 1, 'Custom', 'Custom', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 41fcf708-179f-454e-b5bc-1d53a4495ba2 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('41fcf708-179f-454e-b5bc-1d53a4495ba2', '93FA954E-8112-435F-A544-F9C91534B64B', 2, 'ExactMatch', 'ExactMatch', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID d883f0e1-416f-4d2e-b5fc-d607873f1f7b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d883f0e1-416f-4d2e-b5fc-d607873f1f7b', '93FA954E-8112-435F-A544-F9C91534B64B', 3, 'LowerCaseTrim', 'LowerCaseTrim', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 26222ecc-29f6-4b59-8816-ca3c3a549f32 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('26222ecc-29f6-4b59-8816-ca3c3a549f32', '93FA954E-8112-435F-A544-F9C91534B64B', 4, 'Trim', 'Trim', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID 93FA954E-8112-435F-A544-F9C91534B64B */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='93FA954E-8112-435F-A544-F9C91534B64B'

/* SQL text to insert entity field value with ID 76226f83-8e2f-4328-93ee-8cfb97ee472f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('76226f83-8e2f-4328-93ee-8cfb97ee472f', '7BF9464A-AE37-4710-983E-666806542AB6', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID db63811e-b58c-4948-a335-e36b82c53134 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('db63811e-b58c-4948-a335-e36b82c53134', '7BF9464A-AE37-4710-983E-666806542AB6', 2, 'Disabled', 'Disabled', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID 7BF9464A-AE37-4710-983E-666806542AB6 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='7BF9464A-AE37-4710-983E-666806542AB6'

/* SQL text to insert entity field value with ID 32dfcbbb-5c39-48e4-afb0-b2f258e490fb */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('32dfcbbb-5c39-48e4-afb0-b2f258e490fb', '608206C5-ACE6-4F97-8656-56FBBB99F9BF', 1, 'After Field Tabs', 'After Field Tabs', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID e79adea9-c24e-4fa8-8ab1-2e419faccd46 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e79adea9-c24e-4fa8-8ab1-2e419faccd46', '608206C5-ACE6-4F97-8656-56FBBB99F9BF', 2, 'Before Field Tabs', 'Before Field Tabs', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID 608206C5-ACE6-4F97-8656-56FBBB99F9BF */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='608206C5-ACE6-4F97-8656-56FBBB99F9BF'


/* Create Entity Relationship: MJ: Entities -> MJ: Entity Organic Key Related Entities (One To Many via RelatedEntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '466af6ae-fa39-4ead-b207-0754bd13305a'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('466af6ae-fa39-4ead-b207-0754bd13305a', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'ED243F59-106C-4020-A334-5BAD0CCF7987', 'RelatedEntityID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Entities -> MJ: Entity Organic Keys (One To Many via EntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'ca92f539-c6df-4fef-a4d3-58a04bb84084'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('ca92f539-c6df-4fef-a4d3-58a04bb84084', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '03716AC0-1509-471C-9159-C67D1BE6971E', 'EntityID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Entity Organic Keys -> MJ: Entity Organic Key Related Entities (One To Many via EntityOrganicKeyID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'f5cd9fe7-de1c-4b34-9361-a0067110c479'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('f5cd9fe7-de1c-4b34-9361-a0067110c479', '03716AC0-1509-471C-9159-C67D1BE6971E', 'ED243F59-106C-4020-A334-5BAD0CCF7987', 'EntityOrganicKeyID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    

/* Index for Foreign Keys for EntityOrganicKeyRelatedEntity */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Organic Key Related Entities
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityOrganicKeyID in table EntityOrganicKeyRelatedEntity
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityOrganicKeyRelatedEntity_EntityOrganicKeyID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityOrganicKeyRelatedEntity]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityOrganicKeyRelatedEntity_EntityOrganicKeyID ON [${flyway:defaultSchema}].[EntityOrganicKeyRelatedEntity] ([EntityOrganicKeyID]);

-- Index for foreign key RelatedEntityID in table EntityOrganicKeyRelatedEntity
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityOrganicKeyRelatedEntity_RelatedEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityOrganicKeyRelatedEntity]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityOrganicKeyRelatedEntity_RelatedEntityID ON [${flyway:defaultSchema}].[EntityOrganicKeyRelatedEntity] ([RelatedEntityID]);

/* SQL text to update entity field related entity name field map for entity field ID 8823D767-DB27-4F35-B204-F585085CF840 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='8823D767-DB27-4F35-B204-F585085CF840', @RelatedEntityNameFieldMap='EntityOrganicKey'

/* Index for Foreign Keys for EntityOrganicKey */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Organic Keys
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table EntityOrganicKey
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityOrganicKey_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityOrganicKey]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityOrganicKey_EntityID ON [${flyway:defaultSchema}].[EntityOrganicKey] ([EntityID]);

/* SQL text to update entity field related entity name field map for entity field ID 9E5658B0-59AB-49C9-BC9F-EFD91C00A789 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='9E5658B0-59AB-49C9-BC9F-EFD91C00A789', @RelatedEntityNameFieldMap='Entity'

/* Base View SQL for MJ: Entity Organic Keys */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Organic Keys
-- Item: vwEntityOrganicKeys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Entity Organic Keys
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  EntityOrganicKey
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwEntityOrganicKeys]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwEntityOrganicKeys];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwEntityOrganicKeys]
AS
SELECT
    e.*,
    MJEntity_EntityID.[Name] AS [Entity]
FROM
    [${flyway:defaultSchema}].[EntityOrganicKey] AS e
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_EntityID
  ON
    [e].[EntityID] = MJEntity_EntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityOrganicKeys] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Entity Organic Keys */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Organic Keys
-- Item: Permissions for vwEntityOrganicKeys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityOrganicKeys] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Entity Organic Keys */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Organic Keys
-- Item: spCreateEntityOrganicKey
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityOrganicKey
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntityOrganicKey]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntityOrganicKey];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityOrganicKey]
    @ID uniqueidentifier = NULL,
    @EntityID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @MatchFieldNames nvarchar(500),
    @NormalizationStrategy nvarchar(50) = NULL,
    @CustomNormalizationExpression nvarchar(MAX),
    @AutoCreateRelatedViewOnForm bit = NULL,
    @Sequence int = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntityOrganicKey]
            (
                [ID],
                [EntityID],
                [Name],
                [Description],
                [MatchFieldNames],
                [NormalizationStrategy],
                [CustomNormalizationExpression],
                [AutoCreateRelatedViewOnForm],
                [Sequence],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityID,
                @Name,
                @Description,
                @MatchFieldNames,
                ISNULL(@NormalizationStrategy, 'LowerCaseTrim'),
                @CustomNormalizationExpression,
                ISNULL(@AutoCreateRelatedViewOnForm, 0),
                ISNULL(@Sequence, 0),
                ISNULL(@Status, 'Active')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntityOrganicKey]
            (
                [EntityID],
                [Name],
                [Description],
                [MatchFieldNames],
                [NormalizationStrategy],
                [CustomNormalizationExpression],
                [AutoCreateRelatedViewOnForm],
                [Sequence],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityID,
                @Name,
                @Description,
                @MatchFieldNames,
                ISNULL(@NormalizationStrategy, 'LowerCaseTrim'),
                @CustomNormalizationExpression,
                ISNULL(@AutoCreateRelatedViewOnForm, 0),
                ISNULL(@Sequence, 0),
                ISNULL(@Status, 'Active')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityOrganicKeys] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityOrganicKey] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Entity Organic Keys */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityOrganicKey] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Entity Organic Keys */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Organic Keys
-- Item: spUpdateEntityOrganicKey
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityOrganicKey
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntityOrganicKey]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityOrganicKey];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityOrganicKey]
    @ID uniqueidentifier,
    @EntityID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @MatchFieldNames nvarchar(500),
    @NormalizationStrategy nvarchar(50),
    @CustomNormalizationExpression nvarchar(MAX),
    @AutoCreateRelatedViewOnForm bit,
    @Sequence int,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityOrganicKey]
    SET
        [EntityID] = @EntityID,
        [Name] = @Name,
        [Description] = @Description,
        [MatchFieldNames] = @MatchFieldNames,
        [NormalizationStrategy] = @NormalizationStrategy,
        [CustomNormalizationExpression] = @CustomNormalizationExpression,
        [AutoCreateRelatedViewOnForm] = @AutoCreateRelatedViewOnForm,
        [Sequence] = @Sequence,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntityOrganicKeys] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityOrganicKeys]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityOrganicKey] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityOrganicKey table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntityOrganicKey]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntityOrganicKey];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityOrganicKey
ON [${flyway:defaultSchema}].[EntityOrganicKey]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityOrganicKey]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityOrganicKey] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Entity Organic Keys */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityOrganicKey] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Entity Organic Keys */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Organic Keys
-- Item: spDeleteEntityOrganicKey
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityOrganicKey
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntityOrganicKey]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityOrganicKey];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityOrganicKey]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntityOrganicKey]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityOrganicKey] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Entity Organic Keys */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityOrganicKey] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID FBD92AEE-B9A9-4FFE-9AFD-23D08E2B9158 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='FBD92AEE-B9A9-4FFE-9AFD-23D08E2B9158', @RelatedEntityNameFieldMap='RelatedEntity'

/* Base View SQL for MJ: Entity Organic Key Related Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Organic Key Related Entities
-- Item: vwEntityOrganicKeyRelatedEntities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Entity Organic Key Related Entities
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  EntityOrganicKeyRelatedEntity
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwEntityOrganicKeyRelatedEntities]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwEntityOrganicKeyRelatedEntities];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwEntityOrganicKeyRelatedEntities]
AS
SELECT
    e.*,
    MJEntityOrganicKey_EntityOrganicKeyID.[Name] AS [EntityOrganicKey],
    MJEntity_RelatedEntityID.[Name] AS [RelatedEntity]
FROM
    [${flyway:defaultSchema}].[EntityOrganicKeyRelatedEntity] AS e
INNER JOIN
    [${flyway:defaultSchema}].[EntityOrganicKey] AS MJEntityOrganicKey_EntityOrganicKeyID
  ON
    [e].[EntityOrganicKeyID] = MJEntityOrganicKey_EntityOrganicKeyID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_RelatedEntityID
  ON
    [e].[RelatedEntityID] = MJEntity_RelatedEntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityOrganicKeyRelatedEntities] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Entity Organic Key Related Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Organic Key Related Entities
-- Item: Permissions for vwEntityOrganicKeyRelatedEntities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityOrganicKeyRelatedEntities] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Entity Organic Key Related Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Organic Key Related Entities
-- Item: spCreateEntityOrganicKeyRelatedEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityOrganicKeyRelatedEntity
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntityOrganicKeyRelatedEntity]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntityOrganicKeyRelatedEntity];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityOrganicKeyRelatedEntity]
    @ID uniqueidentifier = NULL,
    @EntityOrganicKeyID uniqueidentifier,
    @RelatedEntityID uniqueidentifier,
    @RelatedEntityFieldNames nvarchar(500),
    @TransitiveObjectName nvarchar(500),
    @TransitiveObjectMatchFieldNames nvarchar(500),
    @TransitiveObjectOutputFieldName nvarchar(255),
    @RelatedEntityJoinFieldName nvarchar(255),
    @DisplayName nvarchar(255),
    @DisplayLocation nvarchar(50) = NULL,
    @DisplayComponentID uniqueidentifier,
    @DisplayComponentConfiguration nvarchar(MAX),
    @Sequence int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntityOrganicKeyRelatedEntity]
            (
                [ID],
                [EntityOrganicKeyID],
                [RelatedEntityID],
                [RelatedEntityFieldNames],
                [TransitiveObjectName],
                [TransitiveObjectMatchFieldNames],
                [TransitiveObjectOutputFieldName],
                [RelatedEntityJoinFieldName],
                [DisplayName],
                [DisplayLocation],
                [DisplayComponentID],
                [DisplayComponentConfiguration],
                [Sequence]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityOrganicKeyID,
                @RelatedEntityID,
                @RelatedEntityFieldNames,
                @TransitiveObjectName,
                @TransitiveObjectMatchFieldNames,
                @TransitiveObjectOutputFieldName,
                @RelatedEntityJoinFieldName,
                @DisplayName,
                ISNULL(@DisplayLocation, 'After Field Tabs'),
                @DisplayComponentID,
                @DisplayComponentConfiguration,
                ISNULL(@Sequence, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntityOrganicKeyRelatedEntity]
            (
                [EntityOrganicKeyID],
                [RelatedEntityID],
                [RelatedEntityFieldNames],
                [TransitiveObjectName],
                [TransitiveObjectMatchFieldNames],
                [TransitiveObjectOutputFieldName],
                [RelatedEntityJoinFieldName],
                [DisplayName],
                [DisplayLocation],
                [DisplayComponentID],
                [DisplayComponentConfiguration],
                [Sequence]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityOrganicKeyID,
                @RelatedEntityID,
                @RelatedEntityFieldNames,
                @TransitiveObjectName,
                @TransitiveObjectMatchFieldNames,
                @TransitiveObjectOutputFieldName,
                @RelatedEntityJoinFieldName,
                @DisplayName,
                ISNULL(@DisplayLocation, 'After Field Tabs'),
                @DisplayComponentID,
                @DisplayComponentConfiguration,
                ISNULL(@Sequence, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityOrganicKeyRelatedEntities] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityOrganicKeyRelatedEntity] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Entity Organic Key Related Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityOrganicKeyRelatedEntity] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Entity Organic Key Related Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Organic Key Related Entities
-- Item: spUpdateEntityOrganicKeyRelatedEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityOrganicKeyRelatedEntity
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntityOrganicKeyRelatedEntity]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityOrganicKeyRelatedEntity];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityOrganicKeyRelatedEntity]
    @ID uniqueidentifier,
    @EntityOrganicKeyID uniqueidentifier,
    @RelatedEntityID uniqueidentifier,
    @RelatedEntityFieldNames nvarchar(500),
    @TransitiveObjectName nvarchar(500),
    @TransitiveObjectMatchFieldNames nvarchar(500),
    @TransitiveObjectOutputFieldName nvarchar(255),
    @RelatedEntityJoinFieldName nvarchar(255),
    @DisplayName nvarchar(255),
    @DisplayLocation nvarchar(50),
    @DisplayComponentID uniqueidentifier,
    @DisplayComponentConfiguration nvarchar(MAX),
    @Sequence int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityOrganicKeyRelatedEntity]
    SET
        [EntityOrganicKeyID] = @EntityOrganicKeyID,
        [RelatedEntityID] = @RelatedEntityID,
        [RelatedEntityFieldNames] = @RelatedEntityFieldNames,
        [TransitiveObjectName] = @TransitiveObjectName,
        [TransitiveObjectMatchFieldNames] = @TransitiveObjectMatchFieldNames,
        [TransitiveObjectOutputFieldName] = @TransitiveObjectOutputFieldName,
        [RelatedEntityJoinFieldName] = @RelatedEntityJoinFieldName,
        [DisplayName] = @DisplayName,
        [DisplayLocation] = @DisplayLocation,
        [DisplayComponentID] = @DisplayComponentID,
        [DisplayComponentConfiguration] = @DisplayComponentConfiguration,
        [Sequence] = @Sequence
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntityOrganicKeyRelatedEntities] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityOrganicKeyRelatedEntities]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityOrganicKeyRelatedEntity] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityOrganicKeyRelatedEntity table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntityOrganicKeyRelatedEntity]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntityOrganicKeyRelatedEntity];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityOrganicKeyRelatedEntity
ON [${flyway:defaultSchema}].[EntityOrganicKeyRelatedEntity]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityOrganicKeyRelatedEntity]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityOrganicKeyRelatedEntity] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Entity Organic Key Related Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityOrganicKeyRelatedEntity] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Entity Organic Key Related Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Organic Key Related Entities
-- Item: spDeleteEntityOrganicKeyRelatedEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityOrganicKeyRelatedEntity
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntityOrganicKeyRelatedEntity]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityOrganicKeyRelatedEntity];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityOrganicKeyRelatedEntity]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntityOrganicKeyRelatedEntity]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityOrganicKeyRelatedEntity] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Entity Organic Key Related Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityOrganicKeyRelatedEntity] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c3f536c9-3559-4916-a833-4e51a7cac5db' OR (EntityID = 'ED243F59-106C-4020-A334-5BAD0CCF7987' AND Name = 'EntityOrganicKey')) BEGIN
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
            'c3f536c9-3559-4916-a833-4e51a7cac5db',
            'ED243F59-106C-4020-A334-5BAD0CCF7987', -- Entity: MJ: Entity Organic Key Related Entities
            100031,
            'EntityOrganicKey',
            'Entity Organic Key',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b532133e-d742-4d4d-95e2-e3fad228bae8' OR (EntityID = 'ED243F59-106C-4020-A334-5BAD0CCF7987' AND Name = 'RelatedEntity')) BEGIN
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
            'b532133e-d742-4d4d-95e2-e3fad228bae8',
            'ED243F59-106C-4020-A334-5BAD0CCF7987', -- Entity: MJ: Entity Organic Key Related Entities
            100032,
            'RelatedEntity',
            'Related Entity',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '01a093f5-9743-457b-ac21-b862a0236693' OR (EntityID = '03716AC0-1509-471C-9159-C67D1BE6971E' AND Name = 'Entity')) BEGIN
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
            '01a093f5-9743-457b-ac21-b862a0236693',
            '03716AC0-1509-471C-9159-C67D1BE6971E', -- Entity: MJ: Entity Organic Keys
            100025,
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
               SET DefaultInView = 1
               WHERE ID = '9C395CF1-C60D-485E-926F-894BC1F43AC8'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'E15BE827-03EA-478C-A8AC-07510C14B69C'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '7BF9464A-AE37-4710-983E-666806542AB6'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '01A093F5-9743-457B-AC21-B862A0236693'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'DB3A2C89-6E45-4A78-8BDE-3E222B5AB2C7'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '9C395CF1-C60D-485E-926F-894BC1F43AC8'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '01A093F5-9743-457B-AC21-B862A0236693'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].[EntityField]
            SET IsNameField = 1
            WHERE ID = 'B532133E-D742-4D4D-95E2-E3FAD228BAE8'
            AND AutoUpdateIsNameField = 1
         

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D864A352-8165-4918-91C0-938488D9AAB3'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '608206C5-ACE6-4F97-8656-56FBBB99F9BF'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '96D996F0-EF09-4ACF-ADC8-67635EB4F0C6'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'C3F536C9-3559-4916-A833-4E51A7CAC5DB'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B532133E-D742-4D4D-95E2-E3FAD228BAE8'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'B26C64A0-D7FE-4A76-820B-7ECB2420CCCE'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'D864A352-8165-4918-91C0-938488D9AAB3'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'C3F536C9-3559-4916-A833-4E51A7CAC5DB'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'B532133E-D742-4D4D-95E2-E3FAD228BAE8'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set categories for 13 fields */

-- UPDATE Entity Field Category Info MJ: Entity Organic Keys.EntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Key Identity',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9E5658B0-59AB-49C9-BC9F-EFD91C00A789' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Organic Keys.Entity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Key Identity',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '01A093F5-9743-457B-AC21-B862A0236693' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Organic Keys.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Key Identity',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CD56F3E1-ED5F-43E0-B5BF-D34E268F3E6B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Organic Keys.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Key Identity',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DB3A2C89-6E45-4A78-8BDE-3E222B5AB2C7' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Organic Keys.MatchFieldNames 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Matching Logic',
   GeneratedFormSection = 'Category',
   DisplayName = 'Match Fields',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9C395CF1-C60D-485E-926F-894BC1F43AC8' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Organic Keys.NormalizationStrategy 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Matching Logic',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '93FA954E-8112-435F-A544-F9C91534B64B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Organic Keys.CustomNormalizationExpression 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Matching Logic',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'SQL'
WHERE 
   ID = '6CDE899D-3A4F-4B24-B566-9D8AB7445C06' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Organic Keys.AutoCreateRelatedViewOnForm 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration & Priority',
   GeneratedFormSection = 'Category',
   DisplayName = 'Auto Create Related View',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FFCB358C-C3A6-43A3-AD6F-CC8E5EDC85DB' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Organic Keys.Sequence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration & Priority',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E15BE827-03EA-478C-A8AC-07510C14B69C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Organic Keys.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration & Priority',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7BF9464A-AE37-4710-983E-666806542AB6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Organic Keys.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BD963C32-D465-47D2-B08B-1A21DFC1E577' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Organic Keys.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '71DBA4A8-0884-4914-915A-C191E40AA1A1' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Organic Keys.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '30C05840-BD02-41D7-84DF-DE9A8718CE98' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-fingerprint */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-fingerprint', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = '03716AC0-1509-471C-9159-C67D1BE6971E'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('6457de0c-779d-4d60-adf1-ea41e373150d', '03716AC0-1509-471C-9159-C67D1BE6971E', 'FieldCategoryInfo', '{"Key Identity":{"icon":"fa fa-id-card","description":"Basic identification and descriptive information for the organic key"},"Matching Logic":{"icon":"fa fa-equals","description":"Technical settings defining which fields are matched and how they are normalized"},"Configuration & Priority":{"icon":"fa fa-sliders-h","description":"Operational settings including status, evaluation order, and automation triggers"},"System Metadata":{"icon":"fa fa-cog","description":"Internal system identifiers and audit timestamps"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('aa24ffa7-b467-4421-ac3e-a6da4f4552ac', '03716AC0-1509-471C-9159-C67D1BE6971E', 'FieldCategoryIcons', '{"Key Identity":"fa fa-id-card","Matching Logic":"fa fa-equals","Configuration & Priority":"fa fa-sliders-h","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = '03716AC0-1509-471C-9159-C67D1BE6971E'
      

/* Set categories for 17 fields */

-- UPDATE Entity Field Category Info MJ: Entity Organic Key Related Entities.EntityOrganicKeyID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Entity Mapping',
   GeneratedFormSection = 'Category',
   DisplayName = 'Organic Key ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8823D767-DB27-4F35-B204-F585085CF840' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Organic Key Related Entities.RelatedEntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Entity Mapping',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FBD92AEE-B9A9-4FFE-9AFD-23D08E2B9158' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Organic Key Related Entities.EntityOrganicKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Entity Mapping',
   GeneratedFormSection = 'Category',
   DisplayName = 'Organic Key',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C3F536C9-3559-4916-A833-4E51A7CAC5DB' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Organic Key Related Entities.RelatedEntity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Entity Mapping',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B532133E-D742-4D4D-95E2-E3FAD228BAE8' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Organic Key Related Entities.RelatedEntityFieldNames 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Matching Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Related Entity Fields',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '79AB1E17-D3F7-4B12-839A-0E96DDD9BF7D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Organic Key Related Entities.TransitiveObjectName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Matching Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B26C64A0-D7FE-4A76-820B-7ECB2420CCCE' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Organic Key Related Entities.TransitiveObjectMatchFieldNames 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Matching Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Transitive Match Fields',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C50CAA30-DF0C-4D4A-BC24-772A0BB1CD7A' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Organic Key Related Entities.TransitiveObjectOutputFieldName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Matching Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Transitive Output Field',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '97AAF30C-7B7D-4B42-ABD6-35B8B73D4D4D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Organic Key Related Entities.RelatedEntityJoinFieldName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Matching Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Related Entity Join Field',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5346851E-131C-48C7-BEBC-2562F358A90F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Organic Key Related Entities.DisplayName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Display Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D864A352-8165-4918-91C0-938488D9AAB3' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Organic Key Related Entities.DisplayLocation 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Display Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '608206C5-ACE6-4F97-8656-56FBBB99F9BF' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Organic Key Related Entities.DisplayComponentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Display Settings',
   GeneratedFormSection = 'Category',
   DisplayName = 'Display Component',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '97087B14-68A4-4EEC-9BA6-AC1DE795C552' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Organic Key Related Entities.DisplayComponentConfiguration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Display Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '85CAED4A-9F18-4B6E-A5FD-1F968FF3A53A' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Organic Key Related Entities.Sequence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Display Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '96D996F0-EF09-4ACF-ADC8-67635EB4F0C6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Organic Key Related Entities.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '83983333-AD6B-4979-94C1-54D11A0F230D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Organic Key Related Entities.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4D0E6469-E42C-4B1C-88D3-1FD33B07E253' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Organic Key Related Entities.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A6AC76C8-59E4-4978-BAD6-5F9FBCBFE649' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-project-diagram */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-project-diagram', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = 'ED243F59-106C-4020-A334-5BAD0CCF7987'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('d12713e5-a81b-430c-8951-7f9d0db64936', 'ED243F59-106C-4020-A334-5BAD0CCF7987', 'FieldCategoryInfo', '{"Entity Mapping":{"icon":"fa fa-link","description":"Core identifiers and names linking the organic key to its related entities"},"Matching Configuration":{"icon":"fa fa-cogs","description":"Technical settings defining how records are matched, including direct and transitive SQL logic"},"Display Settings":{"icon":"fa fa-desktop","description":"UI presentation settings including labels, locations, custom components, and ordering"},"System Metadata":{"icon":"fa fa-database","description":"System-managed identifiers and audit timestamps"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('d57a9541-0023-44d9-a90a-9230810c51aa', 'ED243F59-106C-4020-A334-5BAD0CCF7987', 'FieldCategoryIcons', '{"Entity Mapping":"fa fa-link","Matching Configuration":"fa fa-cogs","Display Settings":"fa fa-desktop","System Metadata":"fa fa-database"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = 'ED243F59-106C-4020-A334-5BAD0CCF7987'
      

/* Generated Validation Functions for MJ: Entity Organic Key Related Entities */
-- CHECK constraint for MJ: Entity Organic Key Related Entities @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '7B31F48E-EDA3-47B4-9602-D98B7EB1AF45', GETUTCDATE(), 'TypeScript','Approved', '([RelatedEntityFieldNames] IS NOT NULL AND [TransitiveObjectName] IS NULL AND [TransitiveObjectMatchFieldNames] IS NULL AND [TransitiveObjectOutputFieldName] IS NULL AND [RelatedEntityJoinFieldName] IS NULL OR [RelatedEntityFieldNames] IS NULL AND [TransitiveObjectName] IS NOT NULL AND [TransitiveObjectMatchFieldNames] IS NOT NULL AND [TransitiveObjectOutputFieldName] IS NOT NULL AND [RelatedEntityJoinFieldName] IS NOT NULL)', 'public ValidateRelatedEntityOrTransitiveMapping(result: ValidationResult) {
	const hasRelatedFields = this.RelatedEntityFieldNames != null;
	const hasTransitiveName = this.TransitiveObjectName != null;
	const hasTransitiveMatch = this.TransitiveObjectMatchFieldNames != null;
	const hasTransitiveOutput = this.TransitiveObjectOutputFieldName != null;
	const hasJoinField = this.RelatedEntityJoinFieldName != null;

	// Option 1: Only RelatedEntityFieldNames is provided
	const isDirectMapping = hasRelatedFields && !hasTransitiveName && !hasTransitiveMatch && !hasTransitiveOutput && !hasJoinField;
	
	// Option 2: All transitive fields are provided and RelatedEntityFieldNames is null
	const isTransitiveMapping = !hasRelatedFields && hasTransitiveName && hasTransitiveMatch && hasTransitiveOutput && hasJoinField;

	if (!isDirectMapping && !isTransitiveMapping) {
		result.Errors.push(new ValidationErrorInfo(
			"RelatedEntityFieldNames",
			"You must provide either only the Related Entity Field Names OR a complete set of Transitive Object fields (Object Name, Match Fields, Output Field, and Join Field). Partial or overlapping configurations are not allowed.",
			this.RelatedEntityFieldNames,
			ValidationErrorType.Failure
		));
	}
}', 'To ensure clear data mapping, you must define a relationship using either the Related Entity Field Names or a complete Transitive Object configuration. This constraint prevents ambiguous setups by ensuring that only one of these two methods is used and that all required fields for a transitive relationship are provided together.', 'ValidateRelatedEntityOrTransitiveMapping', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'ED243F59-106C-4020-A334-5BAD0CCF7987');

            

