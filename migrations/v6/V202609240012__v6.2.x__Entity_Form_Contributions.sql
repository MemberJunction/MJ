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
         '9fe8274e-86eb-4900-bcde-136e02fdb792',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '9fe8274e-86eb-4900-bcde-136e02fdb792', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Entity Form Contributions for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('9fe8274e-86eb-4900-bcde-136e02fdb792' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('9fe8274e-86eb-4900-bcde-136e02fdb792' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Entity Form Contributions for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('9fe8274e-86eb-4900-bcde-136e02fdb792' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('9fe8274e-86eb-4900-bcde-136e02fdb792' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Entity Form Contributions for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('9fe8274e-86eb-4900-bcde-136e02fdb792' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('9fe8274e-86eb-4900-bcde-136e02fdb792' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '82095bcb-68d0-4f23-9d9c-90cd4d1123af' OR (EntityID = '9FE8274E-86EB-4900-BCDE-136E02FDB792' AND Name = 'ID')) BEGIN
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
            '82095bcb-68d0-4f23-9d9c-90cd4d1123af',
            '9FE8274E-86EB-4900-BCDE-136E02FDB792', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9FE8274E-86EB-4900-BCDE-136E02FDB792'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '75a40e45-3bd1-4563-b5ef-380def463677' OR (EntityID = '9FE8274E-86EB-4900-BCDE-136E02FDB792' AND Name = 'EntityID')) BEGIN
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
            '75a40e45-3bd1-4563-b5ef-380def463677',
            '9FE8274E-86EB-4900-BCDE-136E02FDB792', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9FE8274E-86EB-4900-BCDE-136E02FDB792'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd196c1ae-ef50-498a-9760-80ad8039064b' OR (EntityID = '9FE8274E-86EB-4900-BCDE-136E02FDB792' AND Name = 'ComponentID')) BEGIN
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
            'd196c1ae-ef50-498a-9760-80ad8039064b',
            '9FE8274E-86EB-4900-BCDE-136E02FDB792', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9FE8274E-86EB-4900-BCDE-136E02FDB792'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '26b45cd6-a036-4200-84c2-1a22b6e3fd6e' OR (EntityID = '9FE8274E-86EB-4900-BCDE-136E02FDB792' AND Name = 'Name')) BEGIN
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
            '26b45cd6-a036-4200-84c2-1a22b6e3fd6e',
            '9FE8274E-86EB-4900-BCDE-136E02FDB792', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9FE8274E-86EB-4900-BCDE-136E02FDB792'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f2970c48-6fcb-411f-93bf-eba94dd4b791' OR (EntityID = '9FE8274E-86EB-4900-BCDE-136E02FDB792' AND Name = 'Description')) BEGIN
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
            'f2970c48-6fcb-411f-93bf-eba94dd4b791',
            '9FE8274E-86EB-4900-BCDE-136E02FDB792', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9FE8274E-86EB-4900-BCDE-136E02FDB792'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9aab57ae-b496-45d6-afb7-4abb8977cd6d' OR (EntityID = '9FE8274E-86EB-4900-BCDE-136E02FDB792' AND Name = 'Slot')) BEGIN
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
            '9aab57ae-b496-45d6-afb7-4abb8977cd6d',
            '9FE8274E-86EB-4900-BCDE-136E02FDB792', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9FE8274E-86EB-4900-BCDE-136E02FDB792'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '09936987-5a63-482d-972a-3fde9638b948' OR (EntityID = '9FE8274E-86EB-4900-BCDE-136E02FDB792' AND Name = 'SortKey')) BEGIN
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
            '09936987-5a63-482d-972a-3fde9638b948',
            '9FE8274E-86EB-4900-BCDE-136E02FDB792', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9FE8274E-86EB-4900-BCDE-136E02FDB792'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2c51aa2b-e22f-426c-8a36-a21642d3c5a1' OR (EntityID = '9FE8274E-86EB-4900-BCDE-136E02FDB792' AND Name = 'ContributionKey')) BEGIN
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
            '2c51aa2b-e22f-426c-8a36-a21642d3c5a1',
            '9FE8274E-86EB-4900-BCDE-136E02FDB792', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9FE8274E-86EB-4900-BCDE-136E02FDB792'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ba866a11-ab0a-4a97-b4c7-457cd6d01988' OR (EntityID = '9FE8274E-86EB-4900-BCDE-136E02FDB792' AND Name = 'RelatedEntityID')) BEGIN
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
            'ba866a11-ab0a-4a97-b4c7-457cd6d01988',
            '9FE8274E-86EB-4900-BCDE-136E02FDB792', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9FE8274E-86EB-4900-BCDE-136E02FDB792'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6d2caf9b-322b-41b3-a46d-0b9cfd2c1514' OR (EntityID = '9FE8274E-86EB-4900-BCDE-136E02FDB792' AND Name = 'RelatedJoinField')) BEGIN
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
            '6d2caf9b-322b-41b3-a46d-0b9cfd2c1514',
            '9FE8274E-86EB-4900-BCDE-136E02FDB792', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9FE8274E-86EB-4900-BCDE-136E02FDB792'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f940994c-720f-43db-a60c-0b832f33460e' OR (EntityID = '9FE8274E-86EB-4900-BCDE-136E02FDB792' AND Name = 'ReplacesSectionKey')) BEGIN
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
            'f940994c-720f-43db-a60c-0b832f33460e',
            '9FE8274E-86EB-4900-BCDE-136E02FDB792', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9FE8274E-86EB-4900-BCDE-136E02FDB792'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7873fbd8-579c-4d41-be86-1fd3b0ca6b19' OR (EntityID = '9FE8274E-86EB-4900-BCDE-136E02FDB792' AND Name = 'ReplacesSectionKeys')) BEGIN
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
            '7873fbd8-579c-4d41-be86-1fd3b0ca6b19',
            '9FE8274E-86EB-4900-BCDE-136E02FDB792', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9FE8274E-86EB-4900-BCDE-136E02FDB792'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a98e42e3-9dd7-4a6c-b232-cf7e2a057b7c' OR (EntityID = '9FE8274E-86EB-4900-BCDE-136E02FDB792' AND Name = 'ReplacesFieldNames')) BEGIN
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
            'a98e42e3-9dd7-4a6c-b232-cf7e2a057b7c',
            '9FE8274E-86EB-4900-BCDE-136E02FDB792', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9FE8274E-86EB-4900-BCDE-136E02FDB792'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b39abffc-a2ab-47d8-8aca-59d4cc71b02d' OR (EntityID = '9FE8274E-86EB-4900-BCDE-136E02FDB792' AND Name = 'InSectionKey')) BEGIN
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
            'b39abffc-a2ab-47d8-8aca-59d4cc71b02d',
            '9FE8274E-86EB-4900-BCDE-136E02FDB792', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9FE8274E-86EB-4900-BCDE-136E02FDB792'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '56d0f504-4b02-4aea-b0b0-718c019dc3c6' OR (EntityID = '9FE8274E-86EB-4900-BCDE-136E02FDB792' AND Name = 'SectionPosition')) BEGIN
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
            '56d0f504-4b02-4aea-b0b0-718c019dc3c6',
            '9FE8274E-86EB-4900-BCDE-136E02FDB792', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9FE8274E-86EB-4900-BCDE-136E02FDB792'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b7ffaaa1-01c5-499f-ba9a-88711af3a2ff' OR (EntityID = '9FE8274E-86EB-4900-BCDE-136E02FDB792' AND Name = 'Inclusion')) BEGIN
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
            'b7ffaaa1-01c5-499f-ba9a-88711af3a2ff',
            '9FE8274E-86EB-4900-BCDE-136E02FDB792', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9FE8274E-86EB-4900-BCDE-136E02FDB792'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a1b1af4a-f6ee-4d4e-b71b-94d7ac0de57a' OR (EntityID = '9FE8274E-86EB-4900-BCDE-136E02FDB792' AND Name = 'ChromeGroup')) BEGIN
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
            'a1b1af4a-f6ee-4d4e-b71b-94d7ac0de57a',
            '9FE8274E-86EB-4900-BCDE-136E02FDB792', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9FE8274E-86EB-4900-BCDE-136E02FDB792'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '131d4f2f-4850-4479-bb80-a412a48485f7' OR (EntityID = '9FE8274E-86EB-4900-BCDE-136E02FDB792' AND Name = 'Presentation')) BEGIN
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
            '131d4f2f-4850-4479-bb80-a412a48485f7',
            '9FE8274E-86EB-4900-BCDE-136E02FDB792', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9FE8274E-86EB-4900-BCDE-136E02FDB792'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6f667745-5b88-4ef0-88ae-badc94eb5d12' OR (EntityID = '9FE8274E-86EB-4900-BCDE-136E02FDB792' AND Name = 'Title')) BEGIN
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
            '6f667745-5b88-4ef0-88ae-badc94eb5d12',
            '9FE8274E-86EB-4900-BCDE-136E02FDB792', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9FE8274E-86EB-4900-BCDE-136E02FDB792'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0bc4497d-1308-4e8d-9c5d-4801dd4155e7' OR (EntityID = '9FE8274E-86EB-4900-BCDE-136E02FDB792' AND Name = 'Icon')) BEGIN
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
            '0bc4497d-1308-4e8d-9c5d-4801dd4155e7',
            '9FE8274E-86EB-4900-BCDE-136E02FDB792', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9FE8274E-86EB-4900-BCDE-136E02FDB792'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '29f12602-286d-408b-b1f4-0404951bccf8' OR (EntityID = '9FE8274E-86EB-4900-BCDE-136E02FDB792' AND Name = 'Scope')) BEGIN
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
            '29f12602-286d-408b-b1f4-0404951bccf8',
            '9FE8274E-86EB-4900-BCDE-136E02FDB792', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9FE8274E-86EB-4900-BCDE-136E02FDB792'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '459d0934-5402-43c6-a46a-59d65c4d849a' OR (EntityID = '9FE8274E-86EB-4900-BCDE-136E02FDB792' AND Name = 'UserID')) BEGIN
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
            '459d0934-5402-43c6-a46a-59d65c4d849a',
            '9FE8274E-86EB-4900-BCDE-136E02FDB792', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9FE8274E-86EB-4900-BCDE-136E02FDB792'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7adb0dff-6270-4b5f-a4e0-7dbd732ada00' OR (EntityID = '9FE8274E-86EB-4900-BCDE-136E02FDB792' AND Name = 'RoleID')) BEGIN
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
            '7adb0dff-6270-4b5f-a4e0-7dbd732ada00',
            '9FE8274E-86EB-4900-BCDE-136E02FDB792', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9FE8274E-86EB-4900-BCDE-136E02FDB792'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'be318a17-9753-4007-bbc9-4e97a41b2ef1' OR (EntityID = '9FE8274E-86EB-4900-BCDE-136E02FDB792' AND Name = 'Precedence')) BEGIN
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
            'be318a17-9753-4007-bbc9-4e97a41b2ef1',
            '9FE8274E-86EB-4900-BCDE-136E02FDB792', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9FE8274E-86EB-4900-BCDE-136E02FDB792'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f391e797-d5fd-4446-a7be-d04ff21894ba' OR (EntityID = '9FE8274E-86EB-4900-BCDE-136E02FDB792' AND Name = 'Status')) BEGIN
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
            'f391e797-d5fd-4446-a7be-d04ff21894ba',
            '9FE8274E-86EB-4900-BCDE-136E02FDB792', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9FE8274E-86EB-4900-BCDE-136E02FDB792'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '051b81c3-d3a6-455a-a8eb-eb7e0c03da4f' OR (EntityID = '9FE8274E-86EB-4900-BCDE-136E02FDB792' AND Name = 'Configuration')) BEGIN
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
            '051b81c3-d3a6-455a-a8eb-eb7e0c03da4f',
            '9FE8274E-86EB-4900-BCDE-136E02FDB792', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9FE8274E-86EB-4900-BCDE-136E02FDB792'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4651c3e8-ac18-4857-a9f3-d450f5d2d707' OR (EntityID = '9FE8274E-86EB-4900-BCDE-136E02FDB792' AND Name = 'Notes')) BEGIN
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
            '4651c3e8-ac18-4857-a9f3-d450f5d2d707',
            '9FE8274E-86EB-4900-BCDE-136E02FDB792', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9FE8274E-86EB-4900-BCDE-136E02FDB792'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'da2bbfa3-ccf2-43cd-a12a-6bd361d3a652' OR (EntityID = '9FE8274E-86EB-4900-BCDE-136E02FDB792' AND Name = '__mj_CreatedAt')) BEGIN
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
            'da2bbfa3-ccf2-43cd-a12a-6bd361d3a652',
            '9FE8274E-86EB-4900-BCDE-136E02FDB792', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9FE8274E-86EB-4900-BCDE-136E02FDB792'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8e5af416-9e64-4479-8d44-8b24aeca196d' OR (EntityID = '9FE8274E-86EB-4900-BCDE-136E02FDB792' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '8e5af416-9e64-4479-8d44-8b24aeca196d',
            '9FE8274E-86EB-4900-BCDE-136E02FDB792', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9FE8274E-86EB-4900-BCDE-136E02FDB792'),
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

/* SQL text to insert entity field value with ID 51e6ab14-38cb-4788-9075-45f84a4892b1 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('51e6ab14-38cb-4788-9075-45f84a4892b1', '9AAB57AE-B496-45D6-AFB7-4ABB8977CD6D', 1, 'after-everything', 'after-everything', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 7643cb98-14a0-4296-9d22-471c5990d50b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7643cb98-14a0-4296-9d22-471c5990d50b', '9AAB57AE-B496-45D6-AFB7-4ABB8977CD6D', 2, 'after-fields', 'after-fields', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 37a9b043-3623-4dc8-afce-ddbae17dc6f4 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('37a9b043-3623-4dc8-afce-ddbae17dc6f4', '9AAB57AE-B496-45D6-AFB7-4ABB8977CD6D', 3, 'after-related', 'after-related', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 589e0bd2-23ea-4c62-a279-74f17e817cbe */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('589e0bd2-23ea-4c62-a279-74f17e817cbe', '9AAB57AE-B496-45D6-AFB7-4ABB8977CD6D', 4, 'before-fields', 'before-fields', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 49ab8814-f4c1-49a8-9096-cc50285017c0 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('49ab8814-f4c1-49a8-9096-cc50285017c0', '9AAB57AE-B496-45D6-AFB7-4ABB8977CD6D', 5, 'top-area', 'top-area', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 9AAB57AE-B496-45D6-AFB7-4ABB8977CD6D */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='9AAB57AE-B496-45D6-AFB7-4ABB8977CD6D';

/* SQL text to insert entity field value with ID 12abb702-8058-4236-8ccc-529fcc68bb7c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('12abb702-8058-4236-8ccc-529fcc68bb7c', 'B7FFAAA1-01C5-499F-BA9A-88711AF3A2FF', 1, 'More', 'More', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID d3ef6380-2d3a-4fda-a063-d9c71c93cda0 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d3ef6380-2d3a-4fda-a063-d9c71c93cda0', 'B7FFAAA1-01C5-499F-BA9A-88711AF3A2FF', 2, 'None', 'None', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID b63e7ecd-8e63-4bbd-abe5-b5ee3b1f8851 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b63e7ecd-8e63-4bbd-abe5-b5ee3b1f8851', 'B7FFAAA1-01C5-499F-BA9A-88711AF3A2FF', 3, 'Primary', 'Primary', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID B7FFAAA1-01C5-499F-BA9A-88711AF3A2FF */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='B7FFAAA1-01C5-499F-BA9A-88711AF3A2FF';

/* SQL text to insert entity field value with ID 53341c39-96d6-4897-b31f-3fd57e8b6257 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('53341c39-96d6-4897-b31f-3fd57e8b6257', 'A1B1AF4A-F6EE-4D4E-B71B-94D7AC0DE57A', 1, 'details', 'details', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 7dad4e07-180e-418d-a564-c2eed9c28717 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7dad4e07-180e-418d-a564-c2eed9c28717', 'A1B1AF4A-F6EE-4D4E-B71B-94D7AC0DE57A', 2, 'more', 'more', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID A1B1AF4A-F6EE-4D4E-B71B-94D7AC0DE57A */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='A1B1AF4A-F6EE-4D4E-B71B-94D7AC0DE57A';

/* SQL text to insert entity field value with ID f0158a29-b95a-4c25-9249-80a57a0f800a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f0158a29-b95a-4c25-9249-80a57a0f800a', '131D4F2F-4850-4479-BB80-A412A48485F7', 1, 'bare', 'bare', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 69a6a7e9-702f-42b8-a6f1-bba0899c4a2a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('69a6a7e9-702f-42b8-a6f1-bba0899c4a2a', '131D4F2F-4850-4479-BB80-A412A48485F7', 2, 'panel', 'panel', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 131D4F2F-4850-4479-BB80-A412A48485F7 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='131D4F2F-4850-4479-BB80-A412A48485F7';

/* SQL text to insert entity field value with ID 01694ee2-8419-40db-9af3-bcb108a42995 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('01694ee2-8419-40db-9af3-bcb108a42995', '29F12602-286D-408B-B1F4-0404951BCCF8', 1, 'Global', 'Global', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID b026e7af-e617-4e4b-96ac-753375a2af98 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b026e7af-e617-4e4b-96ac-753375a2af98', '29F12602-286D-408B-B1F4-0404951BCCF8', 2, 'Role', 'Role', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID d7b20b67-1dde-4dbd-a2ca-17f4a1d9ac80 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d7b20b67-1dde-4dbd-a2ca-17f4a1d9ac80', '29F12602-286D-408B-B1F4-0404951BCCF8', 3, 'User', 'User', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 29F12602-286D-408B-B1F4-0404951BCCF8 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='29F12602-286D-408B-B1F4-0404951BCCF8';

/* SQL text to insert entity field value with ID 779d5cb9-0004-419d-8cbe-bdbafca094af */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('779d5cb9-0004-419d-8cbe-bdbafca094af', 'F391E797-D5FD-4446-A7BE-D04FF21894BA', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 7aeadf84-201a-46db-a17d-290f573e965b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7aeadf84-201a-46db-a17d-290f573e965b', 'F391E797-D5FD-4446-A7BE-D04FF21894BA', 2, 'Inactive', 'Inactive', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID e08301cd-ffbe-47fc-ab0c-af8de789e159 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e08301cd-ffbe-47fc-ab0c-af8de789e159', 'F391E797-D5FD-4446-A7BE-D04FF21894BA', 3, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID F391E797-D5FD-4446-A7BE-D04FF21894BA */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='F391E797-D5FD-4446-A7BE-D04FF21894BA';

/* SQL text to insert entity field value with ID 1bb00200-53f4-4eee-8ab5-9e868913ec7e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1bb00200-53f4-4eee-8ab5-9e868913ec7e', '56D0F504-4B02-4AEA-B0B0-718C019DC3C6', 1, 'end', 'end', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 33820a98-a6e4-4a5c-8be0-ef54c13edad0 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('33820a98-a6e4-4a5c-8be0-ef54c13edad0', '56D0F504-4B02-4AEA-B0B0-718C019DC3C6', 2, 'start', 'start', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 56D0F504-4B02-4AEA-B0B0-718C019DC3C6 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='56D0F504-4B02-4AEA-B0B0-718C019DC3C6';


/* Create Entity Relationship: MJ: Roles -> MJ: Entity Form Contributions (One To Many via RoleID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '0a7f86e6-8659-4fb1-9e61-3be5b5d94c4d'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('0a7f86e6-8659-4fb1-9e61-3be5b5d94c4d', 'DA238F34-2837-EF11-86D4-6045BDEE16E6', '9FE8274E-86EB-4900-BCDE-136E02FDB792', 'RoleID', 'One To Many', 1, 1, 18, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Entities -> MJ: Entity Form Contributions (One To Many via EntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '3fa3313c-aa50-4410-97b5-7465781c1b98'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('3fa3313c-aa50-4410-97b5-7465781c1b98', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '9FE8274E-86EB-4900-BCDE-136E02FDB792', 'EntityID', 'One To Many', 1, 1, 80, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Entities -> MJ: Entity Form Contributions (One To Many via RelatedEntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '54c99295-c0f6-48e0-8873-892570ce7dbe'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('54c99295-c0f6-48e0-8873-892570ce7dbe', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '9FE8274E-86EB-4900-BCDE-136E02FDB792', 'RelatedEntityID', 'One To Many', 1, 1, 81, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ: Entity Form Contributions (One To Many via UserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '2541a3c2-0851-4ebb-a8eb-efa2805e0667'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('2541a3c2-0851-4ebb-a8eb-efa2805e0667', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '9FE8274E-86EB-4900-BCDE-136E02FDB792', 'UserID', 'One To Many', 1, 1, 106, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Components -> MJ: Entity Form Contributions (One To Many via ComponentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'fa2010e3-a90d-4765-9f46-586e7c0a9b4f'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('fa2010e3-a90d-4765-9f46-586e7c0a9b4f', '0FB98A1D-C6AE-4427-B66C-7B31E669756F', '9FE8274E-86EB-4900-BCDE-136E02FDB792', 'ComponentID', 'One To Many', 1, 1, 5, GETUTCDATE(), GETUTCDATE())
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

/* SQL text to update entity field related entity name field map for entity field ID 75A40E45-3BD1-4563-B5EF-380DEF463677 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='75A40E45-3BD1-4563-B5EF-380DEF463677', @RelatedEntityNameFieldMap='Entity';

/* SQL text to update entity field related entity name field map for entity field ID D196C1AE-EF50-498A-9760-80AD8039064B */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='D196C1AE-EF50-498A-9760-80AD8039064B', @RelatedEntityNameFieldMap='Component';

/* SQL text to update entity field related entity name field map for entity field ID BA866A11-AB0A-4A97-B4C7-457CD6D01988 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='BA866A11-AB0A-4A97-B4C7-457CD6D01988', @RelatedEntityNameFieldMap='RelatedEntity';

/* SQL text to update entity field related entity name field map for entity field ID 459D0934-5402-43C6-A46A-59D65C4D849A */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='459D0934-5402-43C6-A46A-59D65C4D849A', @RelatedEntityNameFieldMap='User';

/* SQL text to update entity field related entity name field map for entity field ID 7ADB0DFF-6270-4B5F-A4E0-7DBD732ADA00 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='7ADB0DFF-6270-4B5F-A4E0-7DBD732ADA00', @RelatedEntityNameFieldMap='Role';

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

/* SQL text to update entity field related entity name field map for entity field ID 83E95083-AE41-428B-82BD-787E1262EC89 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='83E95083-AE41-428B-82BD-787E1262EC89', @RelatedEntityNameFieldMap='FeatureValueCache';

/* SQL text to insert 5 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'abd4d2b9-2a63-43b3-978c-5abcf6430b17' OR (EntityID = '9FE8274E-86EB-4900-BCDE-136E02FDB792' AND Name = 'Entity')) BEGIN
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
            'abd4d2b9-2a63-43b3-978c-5abcf6430b17',
            '9FE8274E-86EB-4900-BCDE-136E02FDB792', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9FE8274E-86EB-4900-BCDE-136E02FDB792'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3d28c025-a08e-47ad-939b-99ce3c3c15f3' OR (EntityID = '9FE8274E-86EB-4900-BCDE-136E02FDB792' AND Name = 'Component')) BEGIN
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
            '3d28c025-a08e-47ad-939b-99ce3c3c15f3',
            '9FE8274E-86EB-4900-BCDE-136E02FDB792', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9FE8274E-86EB-4900-BCDE-136E02FDB792'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '661e4701-8646-4e12-b6f4-3ee64f917c8e' OR (EntityID = '9FE8274E-86EB-4900-BCDE-136E02FDB792' AND Name = 'RelatedEntity')) BEGIN
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
            '661e4701-8646-4e12-b6f4-3ee64f917c8e',
            '9FE8274E-86EB-4900-BCDE-136E02FDB792', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9FE8274E-86EB-4900-BCDE-136E02FDB792'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f2f01df0-810c-451e-8548-df53877abffb' OR (EntityID = '9FE8274E-86EB-4900-BCDE-136E02FDB792' AND Name = 'User')) BEGIN
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
            'f2f01df0-810c-451e-8548-df53877abffb',
            '9FE8274E-86EB-4900-BCDE-136E02FDB792', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9FE8274E-86EB-4900-BCDE-136E02FDB792'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5efbdbfd-4222-4dae-8681-b31014ad1b71' OR (EntityID = '9FE8274E-86EB-4900-BCDE-136E02FDB792' AND Name = 'Role')) BEGIN
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
            '5efbdbfd-4222-4dae-8681-b31014ad1b71',
            '9FE8274E-86EB-4900-BCDE-136E02FDB792', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9FE8274E-86EB-4900-BCDE-136E02FDB792'),
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
               WHERE ID = '9AAB57AE-B496-45D6-AFB7-4ABB8977CD6D'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F391E797-D5FD-4446-A7BE-D04FF21894BA'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'ABD4D2B9-2A63-43B3-978C-5ABCF6430B17'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '3D28C025-A08E-47AD-939B-99CE3C3C15F3'
               AND AutoUpdateDefaultInView = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 0
            WHERE ID = '9FE8274E-86EB-4900-BCDE-136E02FDB792'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set categories for 33 fields */

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.EntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Form Integration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Parent Entity'
WHERE 
   ID = '75A40E45-3BD1-4563-B5EF-380DEF463677';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.ComponentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Form Integration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Component'
WHERE 
   ID = 'D196C1AE-EF50-498A-9760-80AD8039064B';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'General Information',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '26B45CD6-A036-4200-84C2-1A22B6E3FD6E';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'General Information',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F2970C48-6FCB-411F-93BF-EBA94DD4B791';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Slot 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Placement and Layout',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '9AAB57AE-B496-45D6-AFB7-4ABB8977CD6D';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.SortKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Placement and Layout',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '09936987-5A63-482D-972A-3FDE9638B948';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.ContributionKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Form Integration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '2C51AA2B-E22F-426C-8A36-A21642D3C5A1';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.RelatedEntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Replacement Rules',
   GeneratedFormSection = 'Category',
   DisplayName = 'Related Entity'
WHERE 
   ID = 'BA866A11-AB0A-4A97-B4C7-457CD6D01988';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.RelatedJoinField 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Replacement Rules',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '6D2CAF9B-322B-41B3-A46D-0B9CFD2C1514';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.ReplacesSectionKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Replacement Rules',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F940994C-720F-43DB-A60C-0B832F33460E';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.ReplacesSectionKeys 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Replacement Rules',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '7873FBD8-579C-4D41-BE86-1FD3B0CA6B19';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.ReplacesFieldNames 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Replacement Rules',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'A98E42E3-9DD7-4A6C-B232-CF7E2A057B7C';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.InSectionKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Placement and Layout',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'B39ABFFC-A2AB-47D8-8ACA-59D4CC71B02D';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.SectionPosition 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Placement and Layout',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '56D0F504-4B02-4AEA-B0B0-718C019DC3C6';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Inclusion 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Chrome and Presentation',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'B7FFAAA1-01C5-499F-BA9A-88711AF3A2FF';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.ChromeGroup 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Chrome and Presentation',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A1B1AF4A-F6EE-4D4E-B71B-94D7AC0DE57A';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Presentation 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Chrome and Presentation',
   GeneratedFormSection = 'Category',
   DisplayName = 'Presentation Style'
WHERE 
   ID = '131D4F2F-4850-4479-BB80-A412A48485F7';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Title 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Chrome and Presentation',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '6F667745-5B88-4EF0-88AE-BADC94EB5D12';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Icon 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Chrome and Presentation',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Icon'
WHERE 
   ID = '0BC4497D-1308-4E8D-9C5D-4801DD4155E7';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Scope 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Access Control',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '29F12602-286D-408B-B1F4-0404951BCCF8';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.UserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Access Control',
   GeneratedFormSection = 'Category',
   DisplayName = 'User'
WHERE 
   ID = '459D0934-5402-43C6-A46A-59D65C4D849A';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.RoleID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Access Control',
   GeneratedFormSection = 'Category',
   DisplayName = 'Role'
WHERE 
   ID = '7ADB0DFF-6270-4B5F-A4E0-7DBD732ADA00';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Precedence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Form Integration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'BE318A17-9753-4007-BBC9-4E97A41B2EF1';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Form Integration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F391E797-D5FD-4446-A7BE-D04FF21894BA';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Configuration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Form Integration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '051B81C3-D3A6-455A-A8EB-EB7E0C03DA4F';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Notes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'General Information',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Markdown'
WHERE 
   ID = '4651C3E8-AC18-4857-A9F3-D450F5D2D707';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'DA2BBFA3-CCF2-43CD-A12A-6BD361D3A652';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '8E5AF416-9E64-4479-8D44-8B24AECA196D';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Entity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity Name'
WHERE 
   ID = 'ABD4D2B9-2A63-43B3-978C-5ABCF6430B17';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Component 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   DisplayName = 'Component Name'
WHERE 
   ID = '3D28C025-A08E-47AD-939B-99CE3C3C15F3';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.RelatedEntity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   DisplayName = 'Related Entity Name'
WHERE 
   ID = '661E4701-8646-4E12-B6F4-3EE64F917C8E';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.User 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   DisplayName = 'User Name'
WHERE 
   ID = 'F2F01DF0-810C-451E-8548-DF53877ABFFB';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Role 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   DisplayName = 'Role Name'
WHERE 
   ID = '5EFBDBFD-4222-4DAE-8681-B31014AD1B71';

/* Set entity icon to fa fa-puzzle-piece */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-puzzle-piece', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '9FE8274E-86EB-4900-BCDE-136E02FDB792';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '9FE8274E-86EB-4900-BCDE-136E02FDB792' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('ebe021ef-d547-5fb2-b681-9f45cf9f7e81', '9FE8274E-86EB-4900-BCDE-136E02FDB792', 'FieldCategoryInfo', '{
  "Access Control": {
    "description": "Defines visibility rules based on users and roles.",
    "icon": "fa fa-lock"
  },
  "Chrome and Presentation": {
    "description": "Settings for the visual appearance, icons, and rail navigation.",
    "icon": "fa fa-desktop"
  },
  "Form Integration": {
    "description": "Core settings for linking components to forms and managing precedence.",
    "icon": "fa fa-plug"
  },
  "General Information": {
    "description": "Basic identification and documentation for the contribution.",
    "icon": "fa fa-info-circle"
  },
  "Placement and Layout": {
    "description": "Controls where the panel renders on the parent form.",
    "icon": "fa fa-th-large"
  },
  "Replacement Rules": {
    "description": "Logic for replacing existing sections, grids, or fields on the form.",
    "icon": "fa fa-exchange-alt"
  },
  "System Metadata": {
    "description": "System-managed audit and denormalized reference fields.",
    "icon": "fa fa-cog"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '9FE8274E-86EB-4900-BCDE-136E02FDB792' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('582993a7-e8a6-57b2-8317-81a99121cf65', '9FE8274E-86EB-4900-BCDE-136E02FDB792', 'FieldCategoryIcons', '{
  "Access Control": "fa fa-lock",
  "Chrome and Presentation": "fa fa-desktop",
  "Form Integration": "fa fa-plug",
  "General Information": "fa fa-info-circle",
  "Placement and Layout": "fa fa-th-large",
  "Replacement Rules": "fa fa-exchange-alt",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '9FE8274E-86EB-4900-BCDE-136E02FDB792';

/* Generated Validation Functions for MJ: Entity Form Contributions */
-- CHECK constraint for MJ: Entity Form Contributions: Field: ReplacesFieldNames was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = 'A98E42E3-9DD7-4A6C-B232-CF7E2A057B7C'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('8c0ced59-940e-4d8f-ba63-6da794c6da9c', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([ReplacesFieldNames] IS NULL OR isjson([ReplacesFieldNames])=(1) AND left(ltrim([ReplacesFieldNames]),(1))=''['' AND replace(replace(replace(replace([ReplacesFieldNames],char((32)),''''),char((9)),''''),char((13)),''''),char((10)),'''')<>''[]'')', 'public ValidateReplacesFieldNamesJsonArray(result: ValidationResult) {
	if (this.ReplacesFieldNames != null) {
		let isValid = false;
		let errorMessage = "Replaces Field Names must be a valid, non-empty JSON array.";
		try {
			const trimmed = this.ReplacesFieldNames.trim();
			if (trimmed.startsWith("[")) {
				const parsed = JSON.parse(trimmed);
				if (Array.isArray(parsed)) {
					if (parsed.length > 0) {
						isValid = true;
					} else {
						errorMessage = "Replaces Field Names cannot be an empty JSON array.";
					}
				}
			}
		} catch (e) {
			errorMessage = "Replaces Field Names must be a valid JSON formatted array.";
		}

		if (!isValid) {
			result.Errors.push(new ValidationErrorInfo(
				"ReplacesFieldNames",
				errorMessage,
				this.ReplacesFieldNames,
				ValidationErrorType.Failure
			));
		}
	}
}', 'The Replaces Field Names field, if provided, must be a valid, non-empty JSON array. This ensures that replacement fields are properly formatted as a list and not left as empty arrays or invalid JSON.', 'ValidateReplacesFieldNamesJsonArray', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'A98E42E3-9DD7-4A6C-B232-CF7E2A057B7C')
   END;

-- CHECK constraint for MJ: Entity Form Contributions: Field: ReplacesSectionKeys was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '7873FBD8-579C-4D41-BE86-1FD3B0CA6B19'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('976843d6-cdc4-4e56-b66f-ce3bb0400375', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([ReplacesSectionKeys] IS NULL OR isjson([ReplacesSectionKeys])=(1) AND left(ltrim([ReplacesSectionKeys]),(1))=''['' AND replace(replace(replace(replace([ReplacesSectionKeys],char((32)),''''),char((9)),''''),char((13)),''''),char((10)),'''')<>''[]'')', 'public ValidateReplacesSectionKeysIsNonEmptyJsonArray(result: ValidationResult) {
	if (this.ReplacesSectionKeys != null) {
		const trimmed = this.ReplacesSectionKeys.trim();
		if (!trimmed.startsWith(''['')) {
			result.Errors.push(new ValidationErrorInfo(
				"ReplacesSectionKeys",
				"Replaces Section Keys must be a JSON array starting with ''[''.",
				this.ReplacesSectionKeys,
				ValidationErrorType.Failure
			));
			return;
		}
		try {
			const parsed = JSON.parse(trimmed);
			if (!Array.isArray(parsed)) {
				result.Errors.push(new ValidationErrorInfo(
					"ReplacesSectionKeys",
					"Replaces Section Keys must be a valid JSON array.",
					this.ReplacesSectionKeys,
					ValidationErrorType.Failure
				));
			} else if (parsed.length === 0) {
				result.Errors.push(new ValidationErrorInfo(
					"ReplacesSectionKeys",
					"Replaces Section Keys cannot be an empty array.",
					this.ReplacesSectionKeys,
					ValidationErrorType.Failure
				));
			}
		} catch (e) {
			result.Errors.push(new ValidationErrorInfo(
				"ReplacesSectionKeys",
				"Replaces Section Keys must be a valid JSON format.",
				this.ReplacesSectionKeys,
				ValidationErrorType.Failure
			));
		}
	}
}', 'If Replaces Section Keys is provided, it must be a valid, non-empty JSON array.', 'ValidateReplacesSectionKeysIsNonEmptyJsonArray', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '7873FBD8-579C-4D41-BE86-1FD3B0CA6B19')
   END;

-- CHECK constraint for MJ: Entity Form Contributions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '9FE8274E-86EB-4900-BCDE-136E02FDB792'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('27e841bd-5b59-49a7-97a1-925e016be928', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([Presentation]<>''bare'' OR [Inclusion] IS NULL AND [ChromeGroup] IS NULL)', 'public ValidateBarePresentationConstraints(result: ValidationResult) {
    if (this.Presentation === ''bare'' && (this.Inclusion != null || this.ChromeGroup != null)) {
        result.Errors.push(new ValidationErrorInfo(
            "Presentation",
            "When Presentation is set to ''bare'', both Inclusion and ChromeGroup must be empty.",
            this.Presentation,
            ValidationErrorType.Failure
        ));
    }
}', 'If the presentation is set to ''bare'', then both inclusion and chrome group must be empty to ensure proper layout rendering.', 'ValidateBarePresentationConstraints', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '9FE8274E-86EB-4900-BCDE-136E02FDB792')
   END;

-- CHECK constraint for MJ: Entity Form Contributions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '9FE8274E-86EB-4900-BCDE-136E02FDB792'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('f125b323-f3da-4d4d-9f85-e12f6abf75ea', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '(((((case when [ReplacesSectionKey] IS NULL then (0) else (1) end+case when [RelatedEntityID] IS NULL then (0) else (1) end)+case when [ReplacesFieldNames] IS NULL then (0) else (1) end)+case when [ReplacesSectionKeys] IS NULL then (0) else (1) end)+case when [InSectionKey] IS NULL then (0) else (1) end)<=(1))', 'public ValidateMutuallyExclusiveConfigurationFields(result: ValidationResult) {
	let populatedCount = 0;
	if (this.ReplacesSectionKey != null) {
		populatedCount++;
	}
	if (this.RelatedEntityID != null) {
		populatedCount++;
	}
	if (this.ReplacesFieldNames != null) {
		populatedCount++;
	}
	if (this.ReplacesSectionKeys != null) {
		populatedCount++;
	}
	if (this.InSectionKey != null) {
		populatedCount++;
	}

	if (populatedCount > 1) {
		const errorMessage = "Only one of the following fields can be specified: ReplacesSectionKey, RelatedEntityID, ReplacesFieldNames, ReplacesSectionKeys, or InSectionKey.";
		if (this.ReplacesSectionKey != null) {
			result.Errors.push(new ValidationErrorInfo("ReplacesSectionKey", errorMessage, this.ReplacesSectionKey, ValidationErrorType.Failure));
		}
		if (this.RelatedEntityID != null) {
			result.Errors.push(new ValidationErrorInfo("RelatedEntityID", errorMessage, this.RelatedEntityID, ValidationErrorType.Failure));
		}
		if (this.ReplacesFieldNames != null) {
			result.Errors.push(new ValidationErrorInfo("ReplacesFieldNames", errorMessage, this.ReplacesFieldNames, ValidationErrorType.Failure));
		}
		if (this.ReplacesSectionKeys != null) {
			result.Errors.push(new ValidationErrorInfo("ReplacesSectionKeys", errorMessage, this.ReplacesSectionKeys, ValidationErrorType.Failure));
		}
		if (this.InSectionKey != null) {
			result.Errors.push(new ValidationErrorInfo("InSectionKey", errorMessage, this.InSectionKey, ValidationErrorType.Failure));
		}
	}
}', 'Only one of the following fields can be populated at a time: ReplacesSectionKey, RelatedEntityID, ReplacesFieldNames, ReplacesSectionKeys, or InSectionKey. This ensures that mutually exclusive configuration options do not conflict.', 'ValidateMutuallyExclusiveConfigurationFields', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '9FE8274E-86EB-4900-BCDE-136E02FDB792')
   END;

-- CHECK constraint for MJ: Entity Form Contributions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '9FE8274E-86EB-4900-BCDE-136E02FDB792'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('b7576f27-682b-4d83-81bb-acd9cdf9c5d9', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([RelatedJoinField] IS NULL OR [RelatedEntityID] IS NOT NULL)', 'public ValidateRelatedJoinFieldRequiresRelatedEntityID(result: ValidationResult) {
	if (this.RelatedJoinField != null && this.RelatedEntityID == null) {
		result.Errors.push(new ValidationErrorInfo(
			"RelatedJoinField",
			"A Related Entity must be specified when a Related Join Field is provided.",
			this.RelatedJoinField,
			ValidationErrorType.Failure
		));
	}
}', 'If a related join field is specified, a related entity must also be provided to ensure the join relationship is valid.', 'ValidateRelatedJoinFieldRequiresRelatedEntityID', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '9FE8274E-86EB-4900-BCDE-136E02FDB792')
   END;

-- CHECK constraint for MJ: Entity Form Contributions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '9FE8274E-86EB-4900-BCDE-136E02FDB792'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('84739043-a38c-40a7-bb2d-03bfd3ba5527', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([Scope]=''User'' AND [UserID] IS NOT NULL AND [RoleID] IS NULL OR [Scope]=''Role'' AND [RoleID] IS NOT NULL AND [UserID] IS NULL OR [Scope]=''Global'' AND [UserID] IS NULL AND [RoleID] IS NULL)', 'public ValidateScopeUserAndRoleAssignment(result: ValidationResult) {
	const scope = this.Scope;
	const hasUser = this.UserID != null;
	const hasRole = this.RoleID != null;

	if (scope === "User") {
		if (!hasUser || hasRole) {
			result.Errors.push(new ValidationErrorInfo(
				"Scope",
				"When Scope is ''User'', a User must be specified and Role must be empty.",
				scope,
				ValidationErrorType.Failure
			));
		}
	} else if (scope === "Role") {
		if (!hasRole || hasUser) {
			result.Errors.push(new ValidationErrorInfo(
				"Scope",
				"When Scope is ''Role'', a Role must be specified and User must be empty.",
				scope,
				ValidationErrorType.Failure
			));
		}
	} else if (scope === "Global") {
		if (hasUser || hasRole) {
			result.Errors.push(new ValidationErrorInfo(
				"Scope",
				"When Scope is ''Global'', both User and Role must be empty.",
				scope,
				ValidationErrorType.Failure
			));
		}
	} else {
		result.Errors.push(new ValidationErrorInfo(
			"Scope",
			"Scope must be ''User'', ''Role'', or ''Global''.",
			scope,
			ValidationErrorType.Failure
		));
	}
}', 'Ensures that the Scope configuration is valid: if Scope is ''User'', a User ID must be provided and Role ID must be empty; if Scope is ''Role'', a Role ID must be provided and User ID must be empty; if Scope is ''Global'', both User ID and Role ID must be empty.', 'ValidateScopeUserAndRoleAssignment', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '9FE8274E-86EB-4900-BCDE-136E02FDB792')
   END;

-- CHECK constraint for MJ: Entity Form Contributions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '9FE8274E-86EB-4900-BCDE-136E02FDB792'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('b5665fb8-e376-48fe-b773-8c814e110a00', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([SectionPosition] IS NULL OR [ReplacesFieldNames] IS NOT NULL OR [InSectionKey] IS NOT NULL)', 'public ValidateSectionPositionDependencies(result: ValidationResult) {
	if (this.SectionPosition != null && this.ReplacesFieldNames == null && this.InSectionKey == null) {
		result.Errors.push(new ValidationErrorInfo(
			"SectionPosition",
			"When Section Position is specified, you must also provide either Replaces Field Names or In Section Key.",
			this.SectionPosition,
			ValidationErrorType.Failure
		));
	}
}', 'If a Section Position is specified, either Replaces Field Names or In Section Key must also be provided to establish the context for the positioning.', 'ValidateSectionPositionDependencies', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '9FE8274E-86EB-4900-BCDE-136E02FDB792')
   END;

