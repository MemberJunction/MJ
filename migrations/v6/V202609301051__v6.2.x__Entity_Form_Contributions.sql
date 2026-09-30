/* ============================================================================
   MJ: Entity Form Contributions — metadata-registered form contributions

   One row mounts a `componentRole: 'form-panel'` Component (Type='Widget') on a
   parent entity's form. It draws at a slot, inside a section, or in the place of
   what it claims: one or several baked sections, a rail tab, a set of fields or a
   related grid. Peer of compiled BaseFormPanel registrations: the same composer,
   chrome layers and MJ: Form Chrome Rules apply.

   CodeGen handles automatically (intentionally omitted):
     - __mj_CreatedAt / __mj_UpdatedAt columns + triggers
     - Foreign-key indexes (IDX_AUTO_MJ_FKEY_*)
     - Entity / EntityField metadata ("MJ: Entity Form Contributions")
   ============================================================================ */

CREATE TABLE ${flyway:defaultSchema}.EntityFormContribution (
    ID                  UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    EntityID            UNIQUEIDENTIFIER NOT NULL,
    ComponentID         UNIQUEIDENTIFIER NOT NULL,
    Name                NVARCHAR(255)    NOT NULL,
    Description         NVARCHAR(MAX)    NULL,
    Slot                NVARCHAR(30)     NOT NULL DEFAULT 'after-fields',
    SortKey             INT              NOT NULL DEFAULT 0,
    ContributionKey     NVARCHAR(256)    NULL,
    RelatedEntityID     UNIQUEIDENTIFIER NULL,
    RelatedJoinField    NVARCHAR(255)    NULL,
    ReplacesSectionKey  NVARCHAR(255)    NULL,
    ReplacesSectionKeys NVARCHAR(MAX)    NULL,
    ReplacesFieldNames  NVARCHAR(MAX)    NULL,
    InSectionKey        NVARCHAR(255)    NULL,
    SectionPosition     NVARCHAR(10)     NULL,
    Inclusion           NVARCHAR(10)     NULL,
    ChromeGroup         NVARCHAR(10)     NULL,
    Presentation        NVARCHAR(10)     NOT NULL DEFAULT 'panel',
    Title               NVARCHAR(255)    NULL,
    Icon                NVARCHAR(100)    NULL,
    Scope               NVARCHAR(20)     NOT NULL DEFAULT 'User',
    UserID              UNIQUEIDENTIFIER NULL,
    RoleID              UNIQUEIDENTIFIER NULL,
    Precedence          INT              NOT NULL DEFAULT 0,
    Status              NVARCHAR(20)     NOT NULL DEFAULT 'Pending',
    Configuration       NVARCHAR(MAX)    NULL,
    Notes               NVARCHAR(MAX)    NULL,

    CONSTRAINT PK_EntityFormContribution PRIMARY KEY (ID),
    CONSTRAINT FK_EntityFormContribution_Entity
        FOREIGN KEY (EntityID) REFERENCES ${flyway:defaultSchema}.Entity(ID),
    CONSTRAINT FK_EntityFormContribution_Component
        FOREIGN KEY (ComponentID) REFERENCES ${flyway:defaultSchema}.Component(ID),
    CONSTRAINT FK_EntityFormContribution_RelatedEntity
        FOREIGN KEY (RelatedEntityID) REFERENCES ${flyway:defaultSchema}.Entity(ID),
    CONSTRAINT FK_EntityFormContribution_User
        FOREIGN KEY (UserID) REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT FK_EntityFormContribution_Role
        FOREIGN KEY (RoleID) REFERENCES ${flyway:defaultSchema}.Role(ID),
    CONSTRAINT CK_EntityFormContribution_Slot
        CHECK (Slot IN ('top-area', 'before-fields', 'after-fields', 'after-related', 'after-everything')),
    CONSTRAINT CK_EntityFormContribution_Inclusion
        CHECK (Inclusion IS NULL OR Inclusion IN ('Primary', 'More', 'None')),
    CONSTRAINT CK_EntityFormContribution_ChromeGroup
        CHECK (ChromeGroup IS NULL OR ChromeGroup IN ('details', 'more')),
    CONSTRAINT CK_EntityFormContribution_Presentation
        CHECK (Presentation IN ('panel', 'bare')),
    CONSTRAINT CK_EntityFormContribution_Scope
        CHECK (Scope IN ('User', 'Role', 'Global')),
    CONSTRAINT CK_EntityFormContribution_ScopeShape
        CHECK (
            (Scope = 'User'   AND UserID IS NOT NULL AND RoleID IS NULL) OR
            (Scope = 'Role'   AND RoleID IS NOT NULL AND UserID IS NULL) OR
            (Scope = 'Global' AND UserID IS NULL     AND RoleID IS NULL)
        ),
    CONSTRAINT CK_EntityFormContribution_Status
        CHECK (Status IN ('Active', 'Inactive', 'Pending')),
    -- A bare hero is never a rail item, so rail metadata on one is contradictory.
    CONSTRAINT CK_EntityFormContribution_BareNoChrome
        CHECK (Presentation <> 'bare' OR (Inclusion IS NULL AND ChromeGroup IS NULL)),
    -- A join field only disambiguates an existing related claim.
    CONSTRAINT CK_EntityFormContribution_JoinNeedsRelated
        CHECK (RelatedJoinField IS NULL OR RelatedEntityID IS NOT NULL),
    -- One contribution makes one claim at most.
    CONSTRAINT CK_EntityFormContribution_OneClaim
        CHECK (
            (CASE WHEN ReplacesSectionKey  IS NULL THEN 0 ELSE 1 END) +
            (CASE WHEN RelatedEntityID     IS NULL THEN 0 ELSE 1 END) +
            (CASE WHEN ReplacesFieldNames  IS NULL THEN 0 ELSE 1 END) +
            (CASE WHEN ReplacesSectionKeys IS NULL THEN 0 ELSE 1 END) +
            (CASE WHEN InSectionKey        IS NULL THEN 0 ELSE 1 END) <= 1
        ),
    -- The two JSON-array claims reject a non-array and an empty array alike: a claim that names
    -- nothing can never match, so it would read as applied and do nothing. Emptiness is tested by
    -- stripping whitespace, because a CHECK constraint may not contain a subquery.
    CONSTRAINT CK_EntityFormContribution_ReplacesFieldNamesShape
        CHECK (
            ReplacesFieldNames IS NULL
            OR (ISJSON(ReplacesFieldNames) = 1
                AND LEFT(LTRIM(ReplacesFieldNames), 1) = '['
                AND REPLACE(REPLACE(REPLACE(REPLACE(ReplacesFieldNames,
                        CHAR(32), ''), CHAR(9), ''), CHAR(13), ''), CHAR(10), '') <> '[]')
        ),
    CONSTRAINT CK_EntityFormContribution_ReplacesSectionKeysShape
        CHECK (
            ReplacesSectionKeys IS NULL
            OR (ISJSON(ReplacesSectionKeys) = 1
                AND LEFT(LTRIM(ReplacesSectionKeys), 1) = '['
                AND REPLACE(REPLACE(REPLACE(REPLACE(ReplacesSectionKeys,
                        CHAR(32), ''), CHAR(9), ''), CHAR(13), ''), CHAR(10), '') <> '[]')
        ),
    CONSTRAINT CK_EntityFormContribution_SectionPosition
        CHECK (SectionPosition IS NULL OR SectionPosition IN ('start', 'end')),
    -- A position within a section means something only for a panel that draws inside one.
    CONSTRAINT CK_EntityFormContribution_SectionPositionNeedsSection
        CHECK (SectionPosition IS NULL OR ReplacesFieldNames IS NOT NULL OR InSectionKey IS NOT NULL)
);
GO

CREATE UNIQUE INDEX UQ_EntityFormContribution_Key
    ON ${flyway:defaultSchema}.EntityFormContribution (EntityID, ContributionKey, Scope, UserID, RoleID)
    WHERE ContributionKey IS NOT NULL AND Status = 'Active';
GO

-- Keyless related claims derive `related:<entity>:<join>` at runtime, so the index above
-- (ContributionKey IS NOT NULL) does not see them. Without this one, two Active rows can
-- claim the same grid and the winner is decided by row order.
CREATE UNIQUE INDEX UQ_EntityFormContribution_RelatedClaim
    ON ${flyway:defaultSchema}.EntityFormContribution (EntityID, RelatedEntityID, RelatedJoinField, Scope, UserID, RoleID)
    WHERE ContributionKey IS NULL AND RelatedEntityID IS NOT NULL AND Status = 'Active';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Metadata-registered form contribution: mounts a form-panel Component on a parent entity''s form at a slot or inside a section, optionally standing in for baked sections, a rail tab, a set of fields or a related grid. Peer of compiled BaseFormPanel registrations.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityFormContribution';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Parent form entity the panel mounts on.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'EntityID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'MJ: Components row (Type=Widget) whose Specification declares componentRole=form-panel.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'ComponentID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Slot inside the generated form: top-area, before-fields, after-fields, after-related, after-everything.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'Slot';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Order among panels drawn in the same place; higher renders earlier.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'SortKey';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Last-wins identity shared with compiled registrations and MJ: Form Chrome Rules. Null derives related:<entity>:<join> for related claims, otherwise the row never collapses.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'ContributionKey';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'When set, this panel replaces the related-entity grid for that relationship on the parent form.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'RelatedEntityID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Disambiguates two FKs to the same related entity (BillToPersonID vs ShipToPersonID).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'RelatedJoinField';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Section key of one baked block, or rail key of one tab, this contribution stands in for. The panel draws in its place. Mutually exclusive with every other claim.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'ReplacesSectionKey';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON array of section keys this contribution stands in for, all within one tab. The panel draws in the place of the first of them and the others are not drawn. Mutually exclusive with every other claim.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'ReplacesSectionKeys';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON array of field names this contribution stands in for, all within one section. The panel draws inside that section, at SectionPosition, and the named fields are not drawn. Mutually exclusive with every other claim.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'ReplacesFieldNames';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Section key of a section this contribution draws inside, replacing nothing. SectionPosition says whether it draws at the start or the end. Mutually exclusive with every other claim.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'InSectionKey';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Where inside its section the panel draws: start or end. Applies to InSectionKey and to a ReplacesFieldNames claim; null means start.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'SectionPosition';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'L1 chrome inclusion: Primary (own rail item), More (folder), None (hidden). Null = default rail behavior.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'Inclusion';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Pin to the details or more chrome bucket instead of an own rail item.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'ChromeGroup';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'panel = wrapped in a collapsible section with header; bare = hero strip with no chrome and no rail item.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'Presentation';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Section header and rail label. Null falls back to Name.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'Title';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Font Awesome class for the section header and rail item.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'Icon';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Who sees the contribution: User (UserID), Role (RoleID) or Global.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'Scope';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Last-wins precedence against compiled registrations sharing ContributionKey. Ties go to the compiled registration; a row wins only when strictly higher.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'Precedence';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Active rows render. Pending rows are drafts awaiting activation. Inactive rows are history.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'Status';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON passed to the component as contribution.configuration so one component can serve several rows.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'Configuration';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Free-form authoring notes; agents append an iteration log here.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'Notes';
GO


















































/**************************************************************************************************
 * EVERYTHING BELOW THIS LINE WAS GENERATED BY THE MEMBERJUNCTION CODEGEN TOOL.
 *
 * Entity and field metadata for MJ: Entity Form Contributions, its value lists, field categories,
 * AI-generated validators, foreign-key indexes, vwEntityFormContributions, the spCreate / spUpdate /
 * spDelete procedures and their permission grants.
 **************************************************************************************************/

/* SQL generated to create new entity MJ: Entity Form Contributions */

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
         '139ab3b7-c1ab-49bd-a473-47d45a962578',
         'MJ: Entity Form Contributions',
         'Entity Form Contributions',
         'Metadata-registered form contribution: mounts a form-panel Component on a parent entity''s form at a slot or inside a section, optionally standing in for baked sections, a rail tab, a set of fields or a related grid. Peer of compiled BaseFormPanel registrations.',
         NULL,
         'EntityFormContribution',
         'vwEntityFormContributions',
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

/* SQL generated to add new entity MJ: Entity Form Contributions to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '139ab3b7-c1ab-49bd-a473-47d45a962578', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Entity Form Contributions for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('139ab3b7-c1ab-49bd-a473-47d45a962578' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('139ab3b7-c1ab-49bd-a473-47d45a962578' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Entity Form Contributions for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('139ab3b7-c1ab-49bd-a473-47d45a962578' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('139ab3b7-c1ab-49bd-a473-47d45a962578' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Entity Form Contributions for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('139ab3b7-c1ab-49bd-a473-47d45a962578' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('139ab3b7-c1ab-49bd-a473-47d45a962578' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.EntityFormContribution */
ALTER TABLE [${flyway:defaultSchema}].[EntityFormContribution] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.EntityFormContribution */
UPDATE [${flyway:defaultSchema}].[EntityFormContribution] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.EntityFormContribution */
ALTER TABLE [${flyway:defaultSchema}].[EntityFormContribution] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.EntityFormContribution */
ALTER TABLE [${flyway:defaultSchema}].[EntityFormContribution] ADD CONSTRAINT [DF___mj_EntityFormContribution___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.EntityFormContribution */
ALTER TABLE [${flyway:defaultSchema}].[EntityFormContribution] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.EntityFormContribution */
UPDATE [${flyway:defaultSchema}].[EntityFormContribution] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.EntityFormContribution */
ALTER TABLE [${flyway:defaultSchema}].[EntityFormContribution] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.EntityFormContribution */
ALTER TABLE [${flyway:defaultSchema}].[EntityFormContribution] ADD CONSTRAINT [DF___mj_EntityFormContribution___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 29 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '17fd3305-b65b-416b-a5c7-fc26047c1df5' OR (EntityID = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND Name = 'ID')) BEGIN
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
            '17fd3305-b65b-416b-a5c7-fc26047c1df5',
            '139AB3B7-C1AB-49BD-A473-47D45A962578', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '139AB3B7-C1AB-49BD-A473-47D45A962578'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '69fca6df-29f3-4c0d-80ab-3322a4118287' OR (EntityID = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND Name = 'EntityID')) BEGIN
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
            '69fca6df-29f3-4c0d-80ab-3322a4118287',
            '139AB3B7-C1AB-49BD-A473-47D45A962578', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '139AB3B7-C1AB-49BD-A473-47D45A962578'),
            'EntityID',
            'Entity ID',
            'Parent form entity the panel mounts on.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1dcf744d-1a04-4d80-9d09-541e7c39c9cc' OR (EntityID = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND Name = 'ComponentID')) BEGIN
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
            '1dcf744d-1a04-4d80-9d09-541e7c39c9cc',
            '139AB3B7-C1AB-49BD-A473-47D45A962578', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '139AB3B7-C1AB-49BD-A473-47D45A962578'),
            'ComponentID',
            'Component ID',
            'MJ: Components row (Type=Widget) whose Specification declares componentRole=form-panel.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '928676b2-9e5e-4ad9-968a-2c1a1228c992' OR (EntityID = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND Name = 'Name')) BEGIN
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
            '928676b2-9e5e-4ad9-968a-2c1a1228c992',
            '139AB3B7-C1AB-49BD-A473-47D45A962578', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '139AB3B7-C1AB-49BD-A473-47D45A962578'),
            'Name',
            'Name',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'afee789b-d246-4c62-bbdd-d1be0b95751a' OR (EntityID = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND Name = 'Description')) BEGIN
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
            'afee789b-d246-4c62-bbdd-d1be0b95751a',
            '139AB3B7-C1AB-49BD-A473-47D45A962578', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '139AB3B7-C1AB-49BD-A473-47D45A962578'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8afb7d87-e209-4ada-98a2-0743c5906aad' OR (EntityID = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND Name = 'Slot')) BEGIN
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
            '8afb7d87-e209-4ada-98a2-0743c5906aad',
            '139AB3B7-C1AB-49BD-A473-47D45A962578', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '139AB3B7-C1AB-49BD-A473-47D45A962578'),
            'Slot',
            'Slot',
            'Slot inside the generated form: top-area, before-fields, after-fields, after-related, after-everything.',
            'nvarchar',
            60,
            0,
            0,
            0,
            'after-fields',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '189d2cbd-0ae2-4477-839d-1349118074f9' OR (EntityID = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND Name = 'SortKey')) BEGIN
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
            '189d2cbd-0ae2-4477-839d-1349118074f9',
            '139AB3B7-C1AB-49BD-A473-47D45A962578', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '139AB3B7-C1AB-49BD-A473-47D45A962578'),
            'SortKey',
            'Sort Key',
            'Order among panels drawn in the same place; higher renders earlier.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cf2f27ff-0af5-452a-b390-ea7bce43fb81' OR (EntityID = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND Name = 'ContributionKey')) BEGIN
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
            'cf2f27ff-0af5-452a-b390-ea7bce43fb81',
            '139AB3B7-C1AB-49BD-A473-47D45A962578', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '139AB3B7-C1AB-49BD-A473-47D45A962578'),
            'ContributionKey',
            'Contribution Key',
            'Last-wins identity shared with compiled registrations and MJ: Form Chrome Rules. Null derives related:<entity>:<join> for related claims, otherwise the row never collapses.',
            'nvarchar',
            512,
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
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fd7e1b49-aad6-4ef7-8b4f-552a133d859f' OR (EntityID = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND Name = 'RelatedEntityID')) BEGIN
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
            'fd7e1b49-aad6-4ef7-8b4f-552a133d859f',
            '139AB3B7-C1AB-49BD-A473-47D45A962578', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '139AB3B7-C1AB-49BD-A473-47D45A962578'),
            'RelatedEntityID',
            'Related Entity ID',
            'When set, this panel replaces the related-entity grid for that relationship on the parent form.',
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
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3deebc53-7763-43c2-b432-cb7e7537c067' OR (EntityID = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND Name = 'RelatedJoinField')) BEGIN
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
            '3deebc53-7763-43c2-b432-cb7e7537c067',
            '139AB3B7-C1AB-49BD-A473-47D45A962578', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '139AB3B7-C1AB-49BD-A473-47D45A962578'),
            'RelatedJoinField',
            'Related Join Field',
            'Disambiguates two FKs to the same related entity (BillToPersonID vs ShipToPersonID).',
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
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '46f2f4b1-c1b0-4f8e-990f-c70b8f8390d8' OR (EntityID = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND Name = 'ReplacesSectionKey')) BEGIN
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
            '46f2f4b1-c1b0-4f8e-990f-c70b8f8390d8',
            '139AB3B7-C1AB-49BD-A473-47D45A962578', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '139AB3B7-C1AB-49BD-A473-47D45A962578'),
            'ReplacesSectionKey',
            'Replaces Section Key',
            'Section key of one baked block, or rail key of one tab, this contribution stands in for. The panel draws in its place. Mutually exclusive with every other claim.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '28351f96-9d9b-4037-9ed0-239e6850614a' OR (EntityID = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND Name = 'ReplacesSectionKeys')) BEGIN
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
            '28351f96-9d9b-4037-9ed0-239e6850614a',
            '139AB3B7-C1AB-49BD-A473-47D45A962578', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '139AB3B7-C1AB-49BD-A473-47D45A962578'),
            'ReplacesSectionKeys',
            'Replaces Section Keys',
            'JSON array of section keys this contribution stands in for, all within one tab. The panel draws in the place of the first of them and the others are not drawn. Mutually exclusive with every other claim.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4000b0d2-dbcd-45be-8367-2537f2b9f6a4' OR (EntityID = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND Name = 'ReplacesFieldNames')) BEGIN
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
            '4000b0d2-dbcd-45be-8367-2537f2b9f6a4',
            '139AB3B7-C1AB-49BD-A473-47D45A962578', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '139AB3B7-C1AB-49BD-A473-47D45A962578'),
            'ReplacesFieldNames',
            'Replaces Field Names',
            'JSON array of field names this contribution stands in for, all within one section. The panel draws inside that section, at SectionPosition, and the named fields are not drawn. Mutually exclusive with every other claim.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2e2a6623-6759-4b68-9b56-874b744e8bbe' OR (EntityID = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND Name = 'InSectionKey')) BEGIN
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
            '2e2a6623-6759-4b68-9b56-874b744e8bbe',
            '139AB3B7-C1AB-49BD-A473-47D45A962578', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '139AB3B7-C1AB-49BD-A473-47D45A962578'),
            'InSectionKey',
            'In Section Key',
            'Section key of a section this contribution draws inside, replacing nothing. SectionPosition says whether it draws at the start or the end. Mutually exclusive with every other claim.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cf73cd22-fa9a-494e-8fcc-5411d0efb1a2' OR (EntityID = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND Name = 'SectionPosition')) BEGIN
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
            'cf73cd22-fa9a-494e-8fcc-5411d0efb1a2',
            '139AB3B7-C1AB-49BD-A473-47D45A962578', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '139AB3B7-C1AB-49BD-A473-47D45A962578'),
            'SectionPosition',
            'Section Position',
            'Where inside its section the panel draws: start or end. Applies to InSectionKey and to a ReplacesFieldNames claim; null means start.',
            'nvarchar',
            20,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4e737863-e486-478c-8d5a-f0f1b74855cc' OR (EntityID = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND Name = 'Inclusion')) BEGIN
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
            '4e737863-e486-478c-8d5a-f0f1b74855cc',
            '139AB3B7-C1AB-49BD-A473-47D45A962578', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '139AB3B7-C1AB-49BD-A473-47D45A962578'),
            'Inclusion',
            'Inclusion',
            'L1 chrome inclusion: Primary (own rail item), More (folder), None (hidden). Null = default rail behavior.',
            'nvarchar',
            20,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '41d1a5e5-7c6b-40d2-acca-0b083120ab22' OR (EntityID = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND Name = 'ChromeGroup')) BEGIN
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
            '41d1a5e5-7c6b-40d2-acca-0b083120ab22',
            '139AB3B7-C1AB-49BD-A473-47D45A962578', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '139AB3B7-C1AB-49BD-A473-47D45A962578'),
            'ChromeGroup',
            'Chrome Group',
            'Pin to the details or more chrome bucket instead of an own rail item.',
            'nvarchar',
            20,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f3f6eeed-0971-467a-8c17-df4b771b2d44' OR (EntityID = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND Name = 'Presentation')) BEGIN
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
            'f3f6eeed-0971-467a-8c17-df4b771b2d44',
            '139AB3B7-C1AB-49BD-A473-47D45A962578', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '139AB3B7-C1AB-49BD-A473-47D45A962578'),
            'Presentation',
            'Presentation',
            'panel = wrapped in a collapsible section with header; bare = hero strip with no chrome and no rail item.',
            'nvarchar',
            20,
            0,
            0,
            0,
            'panel',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3fe33932-e90a-4937-8f79-e06a9c2eeb32' OR (EntityID = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND Name = 'Title')) BEGIN
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
            '3fe33932-e90a-4937-8f79-e06a9c2eeb32',
            '139AB3B7-C1AB-49BD-A473-47D45A962578', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '139AB3B7-C1AB-49BD-A473-47D45A962578'),
            'Title',
            'Title',
            'Section header and rail label. Null falls back to Name.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4e9a8f05-a588-4717-b6e2-c9d93f3b45cc' OR (EntityID = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND Name = 'Icon')) BEGIN
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
            '4e9a8f05-a588-4717-b6e2-c9d93f3b45cc',
            '139AB3B7-C1AB-49BD-A473-47D45A962578', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '139AB3B7-C1AB-49BD-A473-47D45A962578'),
            'Icon',
            'Icon',
            'Font Awesome class for the section header and rail item.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '058c54dd-6a76-4aec-ab76-33755b4392b4' OR (EntityID = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND Name = 'Scope')) BEGIN
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
            '058c54dd-6a76-4aec-ab76-33755b4392b4',
            '139AB3B7-C1AB-49BD-A473-47D45A962578', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '139AB3B7-C1AB-49BD-A473-47D45A962578'),
            'Scope',
            'Scope',
            'Who sees the contribution: User (UserID), Role (RoleID) or Global.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'User',
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
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2988e27c-6545-4c38-a9df-7e526f200e48' OR (EntityID = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND Name = 'UserID')) BEGIN
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
            '2988e27c-6545-4c38-a9df-7e526f200e48',
            '139AB3B7-C1AB-49BD-A473-47D45A962578', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '139AB3B7-C1AB-49BD-A473-47D45A962578'),
            'UserID',
            'User ID',
            NULL,
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
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c044722c-69a2-4735-a5af-eea3a2801e84' OR (EntityID = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND Name = 'RoleID')) BEGIN
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
            'c044722c-69a2-4735-a5af-eea3a2801e84',
            '139AB3B7-C1AB-49BD-A473-47D45A962578', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '139AB3B7-C1AB-49BD-A473-47D45A962578'),
            'RoleID',
            'Role ID',
            NULL,
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
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '160585ff-9839-4174-bdd7-069a8c97fe36' OR (EntityID = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND Name = 'Precedence')) BEGIN
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
            '160585ff-9839-4174-bdd7-069a8c97fe36',
            '139AB3B7-C1AB-49BD-A473-47D45A962578', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '139AB3B7-C1AB-49BD-A473-47D45A962578'),
            'Precedence',
            'Precedence',
            'Last-wins precedence against compiled registrations sharing ContributionKey. Ties go to the compiled registration; a row wins only when strictly higher.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '228ec6cb-548c-4a7b-98bf-a0cea8ef223c' OR (EntityID = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND Name = 'Status')) BEGIN
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
            '228ec6cb-548c-4a7b-98bf-a0cea8ef223c',
            '139AB3B7-C1AB-49BD-A473-47D45A962578', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '139AB3B7-C1AB-49BD-A473-47D45A962578'),
            'Status',
            'Status',
            'Active rows render. Pending rows are drafts awaiting activation. Inactive rows are history.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Pending',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '18f46076-91c5-448c-8987-e08a8609e050' OR (EntityID = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND Name = 'Configuration')) BEGIN
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
            '18f46076-91c5-448c-8987-e08a8609e050',
            '139AB3B7-C1AB-49BD-A473-47D45A962578', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '139AB3B7-C1AB-49BD-A473-47D45A962578'),
            'Configuration',
            'Configuration',
            'JSON passed to the component as contribution.configuration so one component can serve several rows.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b629edfa-30e5-49ec-be46-0029cff32364' OR (EntityID = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND Name = 'Notes')) BEGIN
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
            'b629edfa-30e5-49ec-be46-0029cff32364',
            '139AB3B7-C1AB-49BD-A473-47D45A962578', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '139AB3B7-C1AB-49BD-A473-47D45A962578'),
            'Notes',
            'Notes',
            'Free-form authoring notes; agents append an iteration log here.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f7c5c0fe-b8bb-4fd5-9280-d48f7b361285' OR (EntityID = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND Name = '__mj_CreatedAt')) BEGIN
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
            'f7c5c0fe-b8bb-4fd5-9280-d48f7b361285',
            '139AB3B7-C1AB-49BD-A473-47D45A962578', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '139AB3B7-C1AB-49BD-A473-47D45A962578'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6e54e325-6cd8-4910-926a-ea4270de3197' OR (EntityID = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '6e54e325-6cd8-4910-926a-ea4270de3197',
            '139AB3B7-C1AB-49BD-A473-47D45A962578', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '139AB3B7-C1AB-49BD-A473-47D45A962578'),
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

/* SQL text to insert entity field value with ID ece45e48-45e9-45c7-8ae4-ca62b510e328 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ece45e48-45e9-45c7-8ae4-ca62b510e328', '8AFB7D87-E209-4ADA-98A2-0743C5906AAD', 1, 'after-everything', 'after-everything', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID a6234aad-4370-4871-9e0f-e578ff12008d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a6234aad-4370-4871-9e0f-e578ff12008d', '8AFB7D87-E209-4ADA-98A2-0743C5906AAD', 2, 'after-fields', 'after-fields', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 7b1aa439-087b-49d8-93a0-376256eb2a49 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7b1aa439-087b-49d8-93a0-376256eb2a49', '8AFB7D87-E209-4ADA-98A2-0743C5906AAD', 3, 'after-related', 'after-related', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID b39095ea-e272-46a4-a3f0-8ee8c094b4c1 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b39095ea-e272-46a4-a3f0-8ee8c094b4c1', '8AFB7D87-E209-4ADA-98A2-0743C5906AAD', 4, 'before-fields', 'before-fields', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 0e35aa06-e095-4443-b355-cef084cd20c5 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0e35aa06-e095-4443-b355-cef084cd20c5', '8AFB7D87-E209-4ADA-98A2-0743C5906AAD', 5, 'top-area', 'top-area', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 8AFB7D87-E209-4ADA-98A2-0743C5906AAD */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='8AFB7D87-E209-4ADA-98A2-0743C5906AAD';

/* SQL text to insert entity field value with ID 90627987-cc03-486a-b915-1eaf20bf775b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('90627987-cc03-486a-b915-1eaf20bf775b', '4E737863-E486-478C-8D5A-F0F1B74855CC', 1, 'More', 'More', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 5938352c-6bfb-4add-9aff-fe537c975cd5 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5938352c-6bfb-4add-9aff-fe537c975cd5', '4E737863-E486-478C-8D5A-F0F1B74855CC', 2, 'None', 'None', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 16cacfac-dcc8-4e3a-bfcd-0fcad93c9e3c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('16cacfac-dcc8-4e3a-bfcd-0fcad93c9e3c', '4E737863-E486-478C-8D5A-F0F1B74855CC', 3, 'Primary', 'Primary', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 4E737863-E486-478C-8D5A-F0F1B74855CC */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='4E737863-E486-478C-8D5A-F0F1B74855CC';

/* SQL text to insert entity field value with ID 9d593f4c-c07d-4538-aaf9-2be046e7c852 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9d593f4c-c07d-4538-aaf9-2be046e7c852', '41D1A5E5-7C6B-40D2-ACCA-0B083120AB22', 1, 'details', 'details', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 4c4d0110-aabe-4ccf-a208-e0f84c304205 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4c4d0110-aabe-4ccf-a208-e0f84c304205', '41D1A5E5-7C6B-40D2-ACCA-0B083120AB22', 2, 'more', 'more', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 41D1A5E5-7C6B-40D2-ACCA-0B083120AB22 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='41D1A5E5-7C6B-40D2-ACCA-0B083120AB22';

/* SQL text to insert entity field value with ID b24ecd17-8321-4581-b5c3-961e486e08a0 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b24ecd17-8321-4581-b5c3-961e486e08a0', 'F3F6EEED-0971-467A-8C17-DF4B771B2D44', 1, 'bare', 'bare', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 0031b77b-092a-40b2-95fb-44a4565dd34a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0031b77b-092a-40b2-95fb-44a4565dd34a', 'F3F6EEED-0971-467A-8C17-DF4B771B2D44', 2, 'panel', 'panel', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID F3F6EEED-0971-467A-8C17-DF4B771B2D44 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='F3F6EEED-0971-467A-8C17-DF4B771B2D44';

/* SQL text to insert entity field value with ID aa60690c-4ecc-47dd-8c06-d1ee581b4701 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('aa60690c-4ecc-47dd-8c06-d1ee581b4701', '058C54DD-6A76-4AEC-AB76-33755B4392B4', 1, 'Global', 'Global', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 0de5be8a-f9f9-47e8-9702-0dba85213ce0 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0de5be8a-f9f9-47e8-9702-0dba85213ce0', '058C54DD-6A76-4AEC-AB76-33755B4392B4', 2, 'Role', 'Role', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 9ba4603d-470a-48fe-a5fa-3421f0ad1a69 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9ba4603d-470a-48fe-a5fa-3421f0ad1a69', '058C54DD-6A76-4AEC-AB76-33755B4392B4', 3, 'User', 'User', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 058C54DD-6A76-4AEC-AB76-33755B4392B4 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='058C54DD-6A76-4AEC-AB76-33755B4392B4';

/* SQL text to insert entity field value with ID bb89b16a-af26-4c7f-93a8-7baf4219a95d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('bb89b16a-af26-4c7f-93a8-7baf4219a95d', '228EC6CB-548C-4A7B-98BF-A0CEA8EF223C', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 4c859037-62a4-46e3-9e55-59e998521307 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4c859037-62a4-46e3-9e55-59e998521307', '228EC6CB-548C-4A7B-98BF-A0CEA8EF223C', 2, 'Inactive', 'Inactive', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 98840feb-0487-416a-ad9f-c56be20f0637 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('98840feb-0487-416a-ad9f-c56be20f0637', '228EC6CB-548C-4A7B-98BF-A0CEA8EF223C', 3, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 228EC6CB-548C-4A7B-98BF-A0CEA8EF223C */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='228EC6CB-548C-4A7B-98BF-A0CEA8EF223C';

/* SQL text to insert entity field value with ID 1c748b3c-2235-4388-b83f-7b94f2f9a69e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1c748b3c-2235-4388-b83f-7b94f2f9a69e', 'CF73CD22-FA9A-494E-8FCC-5411D0EFB1A2', 1, 'end', 'end', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID cfc33d84-385c-4079-9c90-7d1ad75b2e52 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('cfc33d84-385c-4079-9c90-7d1ad75b2e52', 'CF73CD22-FA9A-494E-8FCC-5411D0EFB1A2', 2, 'start', 'start', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID CF73CD22-FA9A-494E-8FCC-5411D0EFB1A2 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='CF73CD22-FA9A-494E-8FCC-5411D0EFB1A2';


/* Create Entity Relationship: MJ: Roles -> MJ: Entity Form Contributions (One To Many via RoleID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '97ff9621-3bc7-424e-ba3b-e35f38d20c0b'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('97ff9621-3bc7-424e-ba3b-e35f38d20c0b', 'DA238F34-2837-EF11-86D4-6045BDEE16E6', '139AB3B7-C1AB-49BD-A473-47D45A962578', 'RoleID', 'One To Many', 1, 1, 18, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Entities -> MJ: Entity Form Contributions (One To Many via EntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'ec59d16b-b7b7-4fac-99b4-a26692646d64'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('ec59d16b-b7b7-4fac-99b4-a26692646d64', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '139AB3B7-C1AB-49BD-A473-47D45A962578', 'EntityID', 'One To Many', 1, 1, 80, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Entities -> MJ: Entity Form Contributions (One To Many via RelatedEntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '419a9802-44d2-401b-ae3a-dc8a897cb22a'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('419a9802-44d2-401b-ae3a-dc8a897cb22a', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '139AB3B7-C1AB-49BD-A473-47D45A962578', 'RelatedEntityID', 'One To Many', 1, 1, 81, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ: Entity Form Contributions (One To Many via UserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '2f756edd-f8e9-418d-ae18-c3be44ac2ae4'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('2f756edd-f8e9-418d-ae18-c3be44ac2ae4', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '139AB3B7-C1AB-49BD-A473-47D45A962578', 'UserID', 'One To Many', 1, 1, 108, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Components -> MJ: Entity Form Contributions (One To Many via ComponentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'e946da3d-f113-4d16-bbc6-0a1beb92792e'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('e946da3d-f113-4d16-bbc6-0a1beb92792e', '0FB98A1D-C6AE-4427-B66C-7B31E669756F', '139AB3B7-C1AB-49BD-A473-47D45A962578', 'ComponentID', 'One To Many', 1, 1, 5, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for EntityFormContribution */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Form Contributions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table EntityFormContribution
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityFormContribution_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityFormContribution]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityFormContribution_EntityID ON [${flyway:defaultSchema}].[EntityFormContribution] ([EntityID]);

-- Index for foreign key ComponentID in table EntityFormContribution
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityFormContribution_ComponentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityFormContribution]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityFormContribution_ComponentID ON [${flyway:defaultSchema}].[EntityFormContribution] ([ComponentID]);

-- Index for foreign key RelatedEntityID in table EntityFormContribution
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityFormContribution_RelatedEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityFormContribution]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityFormContribution_RelatedEntityID ON [${flyway:defaultSchema}].[EntityFormContribution] ([RelatedEntityID]);

-- Index for foreign key UserID in table EntityFormContribution
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityFormContribution_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityFormContribution]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityFormContribution_UserID ON [${flyway:defaultSchema}].[EntityFormContribution] ([UserID]);

-- Index for foreign key RoleID in table EntityFormContribution
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityFormContribution_RoleID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityFormContribution]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityFormContribution_RoleID ON [${flyway:defaultSchema}].[EntityFormContribution] ([RoleID]);

/* SQL text to update entity field related entity name field map for entity field ID 69FCA6DF-29F3-4C0D-80AB-3322A4118287 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='69FCA6DF-29F3-4C0D-80AB-3322A4118287', @RelatedEntityNameFieldMap='Entity';

/* SQL text to update entity field related entity name field map for entity field ID 1DCF744D-1A04-4D80-9D09-541E7C39C9CC */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='1DCF744D-1A04-4D80-9D09-541E7C39C9CC', @RelatedEntityNameFieldMap='Component';

/* SQL text to update entity field related entity name field map for entity field ID FD7E1B49-AAD6-4EF7-8B4F-552A133D859F */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='FD7E1B49-AAD6-4EF7-8B4F-552A133D859F', @RelatedEntityNameFieldMap='RelatedEntity';

/* SQL text to update entity field related entity name field map for entity field ID 2988E27C-6545-4C38-A9DF-7E526F200E48 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='2988E27C-6545-4C38-A9DF-7E526F200E48', @RelatedEntityNameFieldMap='User';

/* SQL text to update entity field related entity name field map for entity field ID C044722C-69A2-4735-A5AF-EEA3A2801E84 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='C044722C-69A2-4735-A5AF-EEA3A2801E84', @RelatedEntityNameFieldMap='Role';

/* Base View SQL for MJ: Entity Form Contributions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Form Contributions
-- Item: vwEntityFormContributions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Entity Form Contributions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  EntityFormContribution
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwEntityFormContributions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwEntityFormContributions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwEntityFormContributions]
AS
SELECT
    e.*,
    MJEntity_EntityID.[Name] AS [Entity],
    MJComponent_ComponentID.[Name] AS [Component],
    MJEntity_RelatedEntityID.[Name] AS [RelatedEntity],
    MJUser_UserID.[Name] AS [User],
    MJRole_RoleID.[Name] AS [Role]
FROM
    [${flyway:defaultSchema}].[EntityFormContribution] AS e
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_EntityID
  ON
    [e].[EntityID] = MJEntity_EntityID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Component] AS MJComponent_ComponentID
  ON
    [e].[ComponentID] = MJComponent_ComponentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_RelatedEntityID
  ON
    [e].[RelatedEntityID] = MJEntity_RelatedEntityID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [e].[UserID] = MJUser_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Role] AS MJRole_RoleID
  ON
    [e].[RoleID] = MJRole_RoleID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityFormContributions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Entity Form Contributions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Form Contributions
-- Item: Permissions for vwEntityFormContributions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityFormContributions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Entity Form Contributions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Form Contributions
-- Item: spCreateEntityFormContribution
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityFormContribution
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntityFormContribution]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntityFormContribution];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityFormContribution]
    @ID uniqueidentifier = NULL,
    @EntityID uniqueidentifier,
    @ComponentID uniqueidentifier,
    @Name nvarchar(255),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Slot nvarchar(30) = NULL,
    @SortKey int = NULL,
    @ContributionKey_Clear bit = 0,
    @ContributionKey nvarchar(256) = NULL,
    @RelatedEntityID_Clear bit = 0,
    @RelatedEntityID uniqueidentifier = NULL,
    @RelatedJoinField_Clear bit = 0,
    @RelatedJoinField nvarchar(255) = NULL,
    @ReplacesSectionKey_Clear bit = 0,
    @ReplacesSectionKey nvarchar(255) = NULL,
    @ReplacesSectionKeys_Clear bit = 0,
    @ReplacesSectionKeys nvarchar(MAX) = NULL,
    @ReplacesFieldNames_Clear bit = 0,
    @ReplacesFieldNames nvarchar(MAX) = NULL,
    @InSectionKey_Clear bit = 0,
    @InSectionKey nvarchar(255) = NULL,
    @SectionPosition_Clear bit = 0,
    @SectionPosition nvarchar(10) = NULL,
    @Inclusion_Clear bit = 0,
    @Inclusion nvarchar(10) = NULL,
    @ChromeGroup_Clear bit = 0,
    @ChromeGroup nvarchar(10) = NULL,
    @Presentation nvarchar(10) = NULL,
    @Title_Clear bit = 0,
    @Title nvarchar(255) = NULL,
    @Icon_Clear bit = 0,
    @Icon nvarchar(100) = NULL,
    @Scope nvarchar(20) = NULL,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @RoleID_Clear bit = 0,
    @RoleID uniqueidentifier = NULL,
    @Precedence int = NULL,
    @Status nvarchar(20) = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntityFormContribution]
            (
                [ID],
                [EntityID],
                [ComponentID],
                [Name],
                [Description],
                [Slot],
                [SortKey],
                [ContributionKey],
                [RelatedEntityID],
                [RelatedJoinField],
                [ReplacesSectionKey],
                [ReplacesSectionKeys],
                [ReplacesFieldNames],
                [InSectionKey],
                [SectionPosition],
                [Inclusion],
                [ChromeGroup],
                [Presentation],
                [Title],
                [Icon],
                [Scope],
                [UserID],
                [RoleID],
                [Precedence],
                [Status],
                [Configuration],
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
                ISNULL(@Slot, 'after-fields'),
                ISNULL(@SortKey, 0),
                CASE WHEN @ContributionKey_Clear = 1 THEN NULL ELSE ISNULL(@ContributionKey, NULL) END,
                CASE WHEN @RelatedEntityID_Clear = 1 THEN NULL ELSE ISNULL(@RelatedEntityID, NULL) END,
                CASE WHEN @RelatedJoinField_Clear = 1 THEN NULL ELSE ISNULL(@RelatedJoinField, NULL) END,
                CASE WHEN @ReplacesSectionKey_Clear = 1 THEN NULL ELSE ISNULL(@ReplacesSectionKey, NULL) END,
                CASE WHEN @ReplacesSectionKeys_Clear = 1 THEN NULL ELSE ISNULL(@ReplacesSectionKeys, NULL) END,
                CASE WHEN @ReplacesFieldNames_Clear = 1 THEN NULL ELSE ISNULL(@ReplacesFieldNames, NULL) END,
                CASE WHEN @InSectionKey_Clear = 1 THEN NULL ELSE ISNULL(@InSectionKey, NULL) END,
                CASE WHEN @SectionPosition_Clear = 1 THEN NULL ELSE ISNULL(@SectionPosition, NULL) END,
                CASE WHEN @Inclusion_Clear = 1 THEN NULL ELSE ISNULL(@Inclusion, NULL) END,
                CASE WHEN @ChromeGroup_Clear = 1 THEN NULL ELSE ISNULL(@ChromeGroup, NULL) END,
                ISNULL(@Presentation, 'panel'),
                CASE WHEN @Title_Clear = 1 THEN NULL ELSE ISNULL(@Title, NULL) END,
                CASE WHEN @Icon_Clear = 1 THEN NULL ELSE ISNULL(@Icon, NULL) END,
                ISNULL(@Scope, 'User'),
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                CASE WHEN @RoleID_Clear = 1 THEN NULL ELSE ISNULL(@RoleID, NULL) END,
                ISNULL(@Precedence, 0),
                ISNULL(@Status, 'Pending'),
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntityFormContribution]
            (
                [EntityID],
                [ComponentID],
                [Name],
                [Description],
                [Slot],
                [SortKey],
                [ContributionKey],
                [RelatedEntityID],
                [RelatedJoinField],
                [ReplacesSectionKey],
                [ReplacesSectionKeys],
                [ReplacesFieldNames],
                [InSectionKey],
                [SectionPosition],
                [Inclusion],
                [ChromeGroup],
                [Presentation],
                [Title],
                [Icon],
                [Scope],
                [UserID],
                [RoleID],
                [Precedence],
                [Status],
                [Configuration],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityID,
                @ComponentID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@Slot, 'after-fields'),
                ISNULL(@SortKey, 0),
                CASE WHEN @ContributionKey_Clear = 1 THEN NULL ELSE ISNULL(@ContributionKey, NULL) END,
                CASE WHEN @RelatedEntityID_Clear = 1 THEN NULL ELSE ISNULL(@RelatedEntityID, NULL) END,
                CASE WHEN @RelatedJoinField_Clear = 1 THEN NULL ELSE ISNULL(@RelatedJoinField, NULL) END,
                CASE WHEN @ReplacesSectionKey_Clear = 1 THEN NULL ELSE ISNULL(@ReplacesSectionKey, NULL) END,
                CASE WHEN @ReplacesSectionKeys_Clear = 1 THEN NULL ELSE ISNULL(@ReplacesSectionKeys, NULL) END,
                CASE WHEN @ReplacesFieldNames_Clear = 1 THEN NULL ELSE ISNULL(@ReplacesFieldNames, NULL) END,
                CASE WHEN @InSectionKey_Clear = 1 THEN NULL ELSE ISNULL(@InSectionKey, NULL) END,
                CASE WHEN @SectionPosition_Clear = 1 THEN NULL ELSE ISNULL(@SectionPosition, NULL) END,
                CASE WHEN @Inclusion_Clear = 1 THEN NULL ELSE ISNULL(@Inclusion, NULL) END,
                CASE WHEN @ChromeGroup_Clear = 1 THEN NULL ELSE ISNULL(@ChromeGroup, NULL) END,
                ISNULL(@Presentation, 'panel'),
                CASE WHEN @Title_Clear = 1 THEN NULL ELSE ISNULL(@Title, NULL) END,
                CASE WHEN @Icon_Clear = 1 THEN NULL ELSE ISNULL(@Icon, NULL) END,
                ISNULL(@Scope, 'User'),
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                CASE WHEN @RoleID_Clear = 1 THEN NULL ELSE ISNULL(@RoleID, NULL) END,
                ISNULL(@Precedence, 0),
                ISNULL(@Status, 'Pending'),
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityFormContributions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityFormContribution] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Entity Form Contributions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityFormContribution] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Entity Form Contributions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Form Contributions
-- Item: spUpdateEntityFormContribution
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityFormContribution
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntityFormContribution]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityFormContribution];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityFormContribution]
    @ID uniqueidentifier,
    @EntityID uniqueidentifier = NULL,
    @ComponentID uniqueidentifier = NULL,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Slot nvarchar(30) = NULL,
    @SortKey int = NULL,
    @ContributionKey_Clear bit = 0,
    @ContributionKey nvarchar(256) = NULL,
    @RelatedEntityID_Clear bit = 0,
    @RelatedEntityID uniqueidentifier = NULL,
    @RelatedJoinField_Clear bit = 0,
    @RelatedJoinField nvarchar(255) = NULL,
    @ReplacesSectionKey_Clear bit = 0,
    @ReplacesSectionKey nvarchar(255) = NULL,
    @ReplacesSectionKeys_Clear bit = 0,
    @ReplacesSectionKeys nvarchar(MAX) = NULL,
    @ReplacesFieldNames_Clear bit = 0,
    @ReplacesFieldNames nvarchar(MAX) = NULL,
    @InSectionKey_Clear bit = 0,
    @InSectionKey nvarchar(255) = NULL,
    @SectionPosition_Clear bit = 0,
    @SectionPosition nvarchar(10) = NULL,
    @Inclusion_Clear bit = 0,
    @Inclusion nvarchar(10) = NULL,
    @ChromeGroup_Clear bit = 0,
    @ChromeGroup nvarchar(10) = NULL,
    @Presentation nvarchar(10) = NULL,
    @Title_Clear bit = 0,
    @Title nvarchar(255) = NULL,
    @Icon_Clear bit = 0,
    @Icon nvarchar(100) = NULL,
    @Scope nvarchar(20) = NULL,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @RoleID_Clear bit = 0,
    @RoleID uniqueidentifier = NULL,
    @Precedence int = NULL,
    @Status nvarchar(20) = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityFormContribution]
    SET
        [EntityID] = ISNULL(@EntityID, [EntityID]),
        [ComponentID] = ISNULL(@ComponentID, [ComponentID]),
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Slot] = ISNULL(@Slot, [Slot]),
        [SortKey] = ISNULL(@SortKey, [SortKey]),
        [ContributionKey] = CASE WHEN @ContributionKey_Clear = 1 THEN NULL ELSE ISNULL(@ContributionKey, [ContributionKey]) END,
        [RelatedEntityID] = CASE WHEN @RelatedEntityID_Clear = 1 THEN NULL ELSE ISNULL(@RelatedEntityID, [RelatedEntityID]) END,
        [RelatedJoinField] = CASE WHEN @RelatedJoinField_Clear = 1 THEN NULL ELSE ISNULL(@RelatedJoinField, [RelatedJoinField]) END,
        [ReplacesSectionKey] = CASE WHEN @ReplacesSectionKey_Clear = 1 THEN NULL ELSE ISNULL(@ReplacesSectionKey, [ReplacesSectionKey]) END,
        [ReplacesSectionKeys] = CASE WHEN @ReplacesSectionKeys_Clear = 1 THEN NULL ELSE ISNULL(@ReplacesSectionKeys, [ReplacesSectionKeys]) END,
        [ReplacesFieldNames] = CASE WHEN @ReplacesFieldNames_Clear = 1 THEN NULL ELSE ISNULL(@ReplacesFieldNames, [ReplacesFieldNames]) END,
        [InSectionKey] = CASE WHEN @InSectionKey_Clear = 1 THEN NULL ELSE ISNULL(@InSectionKey, [InSectionKey]) END,
        [SectionPosition] = CASE WHEN @SectionPosition_Clear = 1 THEN NULL ELSE ISNULL(@SectionPosition, [SectionPosition]) END,
        [Inclusion] = CASE WHEN @Inclusion_Clear = 1 THEN NULL ELSE ISNULL(@Inclusion, [Inclusion]) END,
        [ChromeGroup] = CASE WHEN @ChromeGroup_Clear = 1 THEN NULL ELSE ISNULL(@ChromeGroup, [ChromeGroup]) END,
        [Presentation] = ISNULL(@Presentation, [Presentation]),
        [Title] = CASE WHEN @Title_Clear = 1 THEN NULL ELSE ISNULL(@Title, [Title]) END,
        [Icon] = CASE WHEN @Icon_Clear = 1 THEN NULL ELSE ISNULL(@Icon, [Icon]) END,
        [Scope] = ISNULL(@Scope, [Scope]),
        [UserID] = CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, [UserID]) END,
        [RoleID] = CASE WHEN @RoleID_Clear = 1 THEN NULL ELSE ISNULL(@RoleID, [RoleID]) END,
        [Precedence] = ISNULL(@Precedence, [Precedence]),
        [Status] = ISNULL(@Status, [Status]),
        [Configuration] = CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, [Configuration]) END,
        [Notes] = CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, [Notes]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntityFormContributions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityFormContributions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityFormContribution] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityFormContribution table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntityFormContribution]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntityFormContribution];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityFormContribution
ON [${flyway:defaultSchema}].[EntityFormContribution]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityFormContribution]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityFormContribution] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Entity Form Contributions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityFormContribution] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Entity Form Contributions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Form Contributions
-- Item: spDeleteEntityFormContribution
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityFormContribution
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntityFormContribution]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityFormContribution];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityFormContribution]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntityFormContribution]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityFormContribution] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Entity Form Contributions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityFormContribution] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 5 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd5f2ad37-ecbd-4611-a8b6-8c980482fe70' OR (EntityID = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND Name = 'Entity')) BEGIN
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
            'd5f2ad37-ecbd-4611-a8b6-8c980482fe70',
            '139AB3B7-C1AB-49BD-A473-47D45A962578', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '139AB3B7-C1AB-49BD-A473-47D45A962578'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '49c265e7-9707-438e-bb18-c4d12c116c5f' OR (EntityID = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND Name = 'Component')) BEGIN
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
            '49c265e7-9707-438e-bb18-c4d12c116c5f',
            '139AB3B7-C1AB-49BD-A473-47D45A962578', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '139AB3B7-C1AB-49BD-A473-47D45A962578'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8b74c5cc-1418-404e-bcef-66489ea04456' OR (EntityID = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND Name = 'RelatedEntity')) BEGIN
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
            '8b74c5cc-1418-404e-bcef-66489ea04456',
            '139AB3B7-C1AB-49BD-A473-47D45A962578', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '139AB3B7-C1AB-49BD-A473-47D45A962578'),
            'RelatedEntity',
            'Related Entity',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd73c4665-7ba9-4f67-8293-a0250ea8bd79' OR (EntityID = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND Name = 'User')) BEGIN
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
            'd73c4665-7ba9-4f67-8293-a0250ea8bd79',
            '139AB3B7-C1AB-49BD-A473-47D45A962578', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '139AB3B7-C1AB-49BD-A473-47D45A962578'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd35ffe16-f1f2-4f3f-b7bb-6e1a66dfb073' OR (EntityID = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND Name = 'Role')) BEGIN
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
            'd35ffe16-f1f2-4f3f-b7bb-6e1a66dfb073',
            '139AB3B7-C1AB-49BD-A473-47D45A962578', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '139AB3B7-C1AB-49BD-A473-47D45A962578'),
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
               WHERE ID = '8AFB7D87-E209-4ADA-98A2-0743C5906AAD'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '228EC6CB-548C-4A7B-98BF-A0CEA8EF223C'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D5F2AD37-ECBD-4611-A8B6-8C980482FE70'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '49C265E7-9707-438E-BB18-C4D12C116C5F'
               AND AutoUpdateDefaultInView = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 0
            WHERE ID = '139AB3B7-C1AB-49BD-A473-47D45A962578'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set categories for 28 fields */

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.EntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Target Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Parent Entity'
WHERE 
   ID = '69FCA6DF-29F3-4C0D-80AB-3322A4118287';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.ComponentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Target Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Component'
WHERE 
   ID = '1DCF744D-1A04-4D80-9D09-541E7C39C9CC';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Slot 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Target Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '8AFB7D87-E209-4ADA-98A2-0743C5906AAD';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.SortKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Target Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '189D2CBD-0AE2-4477-839D-1349118074F9';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'General Information',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '928676B2-9E5E-4AD9-968A-2C1A1228C992';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'General Information',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'AFEE789B-D246-4C62-BBDD-D1BE0B95751A';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Title 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'General Information',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '3FE33932-E90A-4937-8F79-E06A9C2EEB32';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Icon 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'General Information',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Icon'
WHERE 
   ID = '4E9A8F05-A588-4717-B6E2-C9D93F3B45CC';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.ContributionKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Override Logic',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'CF2F27FF-0AF5-452A-B390-EA7BCE43FB81';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Precedence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Override Logic',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '160585FF-9839-4174-BDD7-069A8C97FE36';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.RelatedEntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Replacement Logic',
   GeneratedFormSection = 'Category',
   DisplayName = 'Related Entity'
WHERE 
   ID = 'FD7E1B49-AAD6-4EF7-8B4F-552A133D859F';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.RelatedJoinField 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Replacement Logic',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '3DEEBC53-7763-43C2-B432-CB7E7537C067';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.ReplacesSectionKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Replacement Logic',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '46F2F4B1-C1B0-4F8E-990F-C70B8F8390D8';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.ReplacesSectionKeys 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Replacement Logic',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '28351F96-9D9B-4037-9ED0-239E6850614A';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.ReplacesFieldNames 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Replacement Logic',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '4000B0D2-DBCD-45BE-8367-2537F2B9F6A4';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.InSectionKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Replacement Logic',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '2E2A6623-6759-4B68-9B56-874B744E8BBE';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.SectionPosition 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Replacement Logic',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'CF73CD22-FA9A-494E-8FCC-5411D0EFB1A2';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Inclusion 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Display Settings',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '4E737863-E486-478C-8D5A-F0F1B74855CC';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.ChromeGroup 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Display Settings',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '41D1A5E5-7C6B-40D2-ACCA-0B083120AB22';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Presentation 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Display Settings',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F3F6EEED-0971-467A-8C17-DF4B771B2D44';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Scope 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Access Control',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '058C54DD-6A76-4AEC-AB76-33755B4392B4';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.UserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Access Control',
   GeneratedFormSection = 'Category',
   DisplayName = 'User'
WHERE 
   ID = '2988E27C-6545-4C38-A9DF-7E526F200E48';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.RoleID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Access Control',
   GeneratedFormSection = 'Category',
   DisplayName = 'Role'
WHERE 
   ID = 'C044722C-69A2-4735-A5AF-EEA3A2801E84';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Lifecycle Management',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '228EC6CB-548C-4A7B-98BF-A0CEA8EF223C';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Configuration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Lifecycle Management',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '18F46076-91C5-448C-8987-E08A8609E050';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Notes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Lifecycle Management',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'B629EDFA-30E5-49EC-BE46-0029CFF32364';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F7C5C0FE-B8BB-4FD5-9280-D48F7B361285';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '6E54E325-6CD8-4910-926A-EA4270DE3197';

/* Set entity icon to fa fa-puzzle-piece */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-puzzle-piece', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '139AB3B7-C1AB-49BD-A473-47D45A962578';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('7922d42c-ac5e-50c7-9e66-ecac664c657b', '139AB3B7-C1AB-49BD-A473-47D45A962578', 'FieldCategoryInfo', '{
  "Access Control": {
    "description": "Visibility constraints based on users or roles.",
    "icon": "fa fa-lock"
  },
  "Display Settings": {
    "description": "Visual presentation and chrome behavior settings.",
    "icon": "fa fa-desktop"
  },
  "General Information": {
    "description": "Basic naming and labeling for the contribution.",
    "icon": "fa fa-info-circle"
  },
  "Lifecycle Management": {
    "description": "Operational status, configuration, and audit notes.",
    "icon": "fa fa-tasks"
  },
  "Override Logic": {
    "description": "Settings for resolving conflicts between multiple contributions.",
    "icon": "fa fa-balance-scale"
  },
  "Replacement Logic": {
    "description": "Rules for replacing existing form sections or fields.",
    "icon": "fa fa-exchange-alt"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields.",
    "icon": "fa fa-cog"
  },
  "Target Configuration": {
    "description": "Defines where and how the component mounts on the parent form.",
    "icon": "fa fa-crosshairs"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('d1f59d2d-f879-54dc-bffe-1d042cd2d64d', '139AB3B7-C1AB-49BD-A473-47D45A962578', 'FieldCategoryIcons', '{
  "Access Control": "fa fa-lock",
  "Display Settings": "fa fa-desktop",
  "General Information": "fa fa-info-circle",
  "Lifecycle Management": "fa fa-tasks",
  "Override Logic": "fa fa-balance-scale",
  "Replacement Logic": "fa fa-exchange-alt",
  "System Metadata": "fa fa-cog",
  "Target Configuration": "fa fa-crosshairs"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '139AB3B7-C1AB-49BD-A473-47D45A962578';

/* Generated Validation Functions for MJ: Entity Form Contributions */
-- CHECK constraint for MJ: Entity Form Contributions: Field: ReplacesFieldNames was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '4000B0D2-DBCD-45BE-8367-2537F2B9F6A4'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('cf61d949-07cf-4d1f-9670-2bdbebc456c7', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([ReplacesFieldNames] IS NULL OR isjson([ReplacesFieldNames])=(1) AND left(ltrim([ReplacesFieldNames]),(1))=''['' AND replace(replace(replace(replace([ReplacesFieldNames],char((32)),''''),char((9)),''''),char((13)),''''),char((10)),'''')<>''[]'')', 'public ValidateReplacesFieldNamesIsNonEmptyJsonArray(result: ValidationResult) {
    if (this.ReplacesFieldNames != null) {
        let isValid = false;
        try {
            const trimmed = this.ReplacesFieldNames.trim();
            if (trimmed.startsWith("[")) {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    isValid = true;
                }
            }
        } catch (e) {
            // JSON parsing failed
        }

        if (!isValid) {
            result.Errors.push(new ValidationErrorInfo(
                "ReplacesFieldNames",
                "Replaces Field Names must be a valid, non-empty JSON array (e.g., [\"FieldName\"]).",
                this.ReplacesFieldNames,
                ValidationErrorType.Failure
            ));
        }
    }
}', 'If Replaces Field Names is provided, it must be a valid, non-empty JSON array of field names.', 'ValidateReplacesFieldNamesIsNonEmptyJsonArray', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '4000B0D2-DBCD-45BE-8367-2537F2B9F6A4')
   END;

-- CHECK constraint for MJ: Entity Form Contributions: Field: ReplacesSectionKeys was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '28351F96-9D9B-4037-9ED0-239E6850614A'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('08c1dac7-dc88-48b8-9dc3-cf6adc5e60e7', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([ReplacesSectionKeys] IS NULL OR isjson([ReplacesSectionKeys])=(1) AND left(ltrim([ReplacesSectionKeys]),(1))=''['' AND replace(replace(replace(replace([ReplacesSectionKeys],char((32)),''''),char((9)),''''),char((13)),''''),char((10)),'''')<>''[]'')', 'public ValidateReplacesSectionKeysIsNonEmptyJsonArray(result: ValidationResult) {
	if (this.ReplacesSectionKeys != null) {
		let isValid = false;
		let isEmpty = true;
		try {
			const value = this.ReplacesSectionKeys.trim();
			if (value.startsWith("[")) {
				const parsed = JSON.parse(value);
				if (Array.isArray(parsed)) {
					isValid = true;
					if (parsed.length > 0) {
						isEmpty = false;
					}
				}
			}
		} catch (e) {
			isValid = false;
		}

		if (!isValid) {
			result.Errors.push(new ValidationErrorInfo(
				"ReplacesSectionKeys",
				"Replaces Section Keys must be a valid JSON array.",
				this.ReplacesSectionKeys,
				ValidationErrorType.Failure
			));
		} else if (isEmpty) {
			result.Errors.push(new ValidationErrorInfo(
				"ReplacesSectionKeys",
				"Replaces Section Keys array cannot be empty.",
				this.ReplacesSectionKeys,
				ValidationErrorType.Failure
			));
		}
	}
}', 'If Replaces Section Keys is provided, it must be a valid JSON array containing at least one element. It cannot be empty or just an empty array structure.', 'ValidateReplacesSectionKeysIsNonEmptyJsonArray', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '28351F96-9D9B-4037-9ED0-239E6850614A')
   END;

-- CHECK constraint for MJ: Entity Form Contributions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '139AB3B7-C1AB-49BD-A473-47D45A962578'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('2ca14b9e-f203-4b12-9e7b-bf3c921d8f8c', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '(((((case when [ReplacesSectionKey] IS NULL then (0) else (1) end+case when [RelatedEntityID] IS NULL then (0) else (1) end)+case when [ReplacesFieldNames] IS NULL then (0) else (1) end)+case when [ReplacesSectionKeys] IS NULL then (0) else (1) end)+case when [InSectionKey] IS NULL then (0) else (1) end)<=(1))', 'public ValidateMutuallyExclusiveReplacementAndRelationshipFields(result: ValidationResult) {
	let count = 0;
	if (this.ReplacesSectionKey != null) {
		count++;
	}
	if (this.RelatedEntityID != null) {
		count++;
	}
	if (this.ReplacesFieldNames != null) {
		count++;
	}
	if (this.ReplacesSectionKeys != null) {
		count++;
	}
	if (this.InSectionKey != null) {
		count++;
	}

	if (count > 1) {
		const message = "Only one of ReplacesSectionKey, RelatedEntityID, ReplacesFieldNames, ReplacesSectionKeys, or InSectionKey may be specified.";
		if (this.ReplacesSectionKey != null) {
			result.Errors.push(new ValidationErrorInfo("ReplacesSectionKey", message, this.ReplacesSectionKey, ValidationErrorType.Failure));
		}
		if (this.RelatedEntityID != null) {
			result.Errors.push(new ValidationErrorInfo("RelatedEntityID", message, this.RelatedEntityID, ValidationErrorType.Failure));
		}
		if (this.ReplacesFieldNames != null) {
			result.Errors.push(new ValidationErrorInfo("ReplacesFieldNames", message, this.ReplacesFieldNames, ValidationErrorType.Failure));
		}
		if (this.ReplacesSectionKeys != null) {
			result.Errors.push(new ValidationErrorInfo("ReplacesSectionKeys", message, this.ReplacesSectionKeys, ValidationErrorType.Failure));
		}
		if (this.InSectionKey != null) {
			result.Errors.push(new ValidationErrorInfo("InSectionKey", message, this.InSectionKey, ValidationErrorType.Failure));
		}
	}
}', 'Only one of the following fields can be set at a time: Replaces Section Key, Related Entity ID, Replaces Field Names, Replaces Section Keys, or In Section Key. This prevents conflicting configuration definitions.', 'ValidateMutuallyExclusiveReplacementAndRelationshipFields', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '139AB3B7-C1AB-49BD-A473-47D45A962578')
   END;

-- CHECK constraint for MJ: Entity Form Contributions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '139AB3B7-C1AB-49BD-A473-47D45A962578'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('db9b20c5-cce2-4521-9903-6a85332370bd', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([Presentation]<>''bare'' OR [Inclusion] IS NULL AND [ChromeGroup] IS NULL)', 'public ValidatePresentationBareInclusionAndChromeGroup(result: ValidationResult) {
	if (this.Presentation === "bare") {
		if (this.Inclusion != null || this.ChromeGroup != null) {
			result.Errors.push(new ValidationErrorInfo(
				"Presentation",
				"When Presentation is set to ''bare'', both Inclusion and ChromeGroup must be empty.",
				this.Presentation,
				ValidationErrorType.Failure
			));
		}
	}
}', 'If the presentation style is set to ''bare'', then both Inclusion and ChromeGroup must be left empty.', 'ValidatePresentationBareInclusionAndChromeGroup', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '139AB3B7-C1AB-49BD-A473-47D45A962578')
   END;

-- CHECK constraint for MJ: Entity Form Contributions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '139AB3B7-C1AB-49BD-A473-47D45A962578'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('8989007e-5cf9-4cbb-98da-57b0943ca866', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([RelatedJoinField] IS NULL OR [RelatedEntityID] IS NOT NULL)', 'public ValidateRelatedJoinFieldRequiresRelatedEntityID(result: ValidationResult) {
	if (this.RelatedJoinField != null && this.RelatedJoinField.trim() !== "" && this.RelatedEntityID == null) {
		result.Errors.push(new ValidationErrorInfo(
			"RelatedEntityID",
			"A Related Entity must be specified when a Related Join Field is provided.",
			this.RelatedEntityID,
			ValidationErrorType.Failure
		));
	}
}', 'If a Related Join Field is specified, a Related Entity must also be provided to ensure the join field has a valid target entity.', 'ValidateRelatedJoinFieldRequiresRelatedEntityID', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '139AB3B7-C1AB-49BD-A473-47D45A962578')
   END;

-- CHECK constraint for MJ: Entity Form Contributions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '139AB3B7-C1AB-49BD-A473-47D45A962578'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('4326817d-9178-442f-ba51-b7ea092f1db9', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([Scope]=''User'' AND [UserID] IS NOT NULL AND [RoleID] IS NULL OR [Scope]=''Role'' AND [RoleID] IS NOT NULL AND [UserID] IS NULL OR [Scope]=''Global'' AND [UserID] IS NULL AND [RoleID] IS NULL)', 'public ValidateScopeAssociations(result: ValidationResult) {
	if (this.Scope === ''User'') {
		if (this.UserID == null) {
			result.Errors.push(new ValidationErrorInfo(
				"UserID",
				"A User must be specified when the Scope is set to ''User''.",
				this.UserID,
				ValidationErrorType.Failure
			));
		}
		if (this.RoleID != null) {
			result.Errors.push(new ValidationErrorInfo(
				"RoleID",
				"Role cannot be specified when the Scope is set to ''User''.",
				this.RoleID,
				ValidationErrorType.Failure
			));
		}
	} else if (this.Scope === ''Role'') {
		if (this.RoleID == null) {
			result.Errors.push(new ValidationErrorInfo(
				"RoleID",
				"A Role must be specified when the Scope is set to ''Role''.",
				this.RoleID,
				ValidationErrorType.Failure
			));
		}
		if (this.UserID != null) {
			result.Errors.push(new ValidationErrorInfo(
				"UserID",
				"User cannot be specified when the Scope is set to ''Role''.",
				this.UserID,
				ValidationErrorType.Failure
			));
		}
	} else if (this.Scope === ''Global'') {
		if (this.UserID != null) {
			result.Errors.push(new ValidationErrorInfo(
				"UserID",
				"User cannot be specified when the Scope is set to ''Global''.",
				this.UserID,
				ValidationErrorType.Failure
			));
		}
		if (this.RoleID != null) {
			result.Errors.push(new ValidationErrorInfo(
				"RoleID",
				"Role cannot be specified when the Scope is set to ''Global''.",
				this.RoleID,
				ValidationErrorType.Failure
			));
		}
	}
}', 'Ensures that the assigned User or Role matches the selected Scope. A ''User'' scope requires a User ID and no Role ID, a ''Role'' scope requires a Role ID and no User ID, and a ''Global'' scope requires both User ID and Role ID to be empty.', 'ValidateScopeAssociations', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '139AB3B7-C1AB-49BD-A473-47D45A962578')
   END;

-- CHECK constraint for MJ: Entity Form Contributions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '139AB3B7-C1AB-49BD-A473-47D45A962578'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('b7b03151-7b8c-4f23-97e3-be1bdee06f1e', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([SectionPosition] IS NULL OR [ReplacesFieldNames] IS NOT NULL OR [InSectionKey] IS NOT NULL)', 'public ValidateSectionPositionDependencies(result: ValidationResult) {
	// If SectionPosition is provided, at least one of ReplacesFieldNames or InSectionKey must also be provided
	if (this.SectionPosition != null && this.ReplacesFieldNames == null && this.InSectionKey == null) {
		result.Errors.push(new ValidationErrorInfo(
			"SectionPosition",
			"When Section Position is specified, you must also provide either Replaces Field Names or In Section Key.",
			this.SectionPosition,
			ValidationErrorType.Failure
		));
	}
}', 'If a Section Position is specified, either the Replaces Field Names or the In Section Key must also be provided to define the context of the position.', 'ValidateSectionPositionDependencies', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '139AB3B7-C1AB-49BD-A473-47D45A962578')
   END;
