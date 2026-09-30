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
         'cc48de93-71ee-403e-b5b9-ad5bdfaabc18',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'cc48de93-71ee-403e-b5b9-ad5bdfaabc18', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Entity Form Contributions for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('cc48de93-71ee-403e-b5b9-ad5bdfaabc18' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('cc48de93-71ee-403e-b5b9-ad5bdfaabc18' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Entity Form Contributions for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('cc48de93-71ee-403e-b5b9-ad5bdfaabc18' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('cc48de93-71ee-403e-b5b9-ad5bdfaabc18' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Entity Form Contributions for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('cc48de93-71ee-403e-b5b9-ad5bdfaabc18' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('cc48de93-71ee-403e-b5b9-ad5bdfaabc18' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3606fe30-ad73-44cb-9042-e79bda4ba172' OR (EntityID = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18' AND Name = 'ID')) BEGIN
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
            '3606fe30-ad73-44cb-9042-e79bda4ba172',
            'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b91bf4e8-2fd8-4648-98a9-dcb42f1df112' OR (EntityID = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18' AND Name = 'EntityID')) BEGIN
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
            'b91bf4e8-2fd8-4648-98a9-dcb42f1df112',
            'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5515d72a-25d8-48b2-bde7-a7394491f474' OR (EntityID = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18' AND Name = 'ComponentID')) BEGIN
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
            '5515d72a-25d8-48b2-bde7-a7394491f474',
            'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '54d82f2f-529d-47cd-961c-a6b67b1c3ab9' OR (EntityID = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18' AND Name = 'Name')) BEGIN
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
            '54d82f2f-529d-47cd-961c-a6b67b1c3ab9',
            'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '81ae8859-cade-49d2-a03a-a9dc95135f96' OR (EntityID = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18' AND Name = 'Description')) BEGIN
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
            '81ae8859-cade-49d2-a03a-a9dc95135f96',
            'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3b573cdb-ce39-4c1e-9000-c9bf86dc898b' OR (EntityID = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18' AND Name = 'Slot')) BEGIN
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
            '3b573cdb-ce39-4c1e-9000-c9bf86dc898b',
            'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '56033cae-cf1c-467d-bbb9-db9e61b2ec83' OR (EntityID = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18' AND Name = 'SortKey')) BEGIN
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
            '56033cae-cf1c-467d-bbb9-db9e61b2ec83',
            'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c3e75f52-bf6b-44b3-af86-2a4a6182cf14' OR (EntityID = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18' AND Name = 'ContributionKey')) BEGIN
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
            'c3e75f52-bf6b-44b3-af86-2a4a6182cf14',
            'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '962e5c3f-10f2-45c2-9768-ae67596b32ad' OR (EntityID = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18' AND Name = 'RelatedEntityID')) BEGIN
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
            '962e5c3f-10f2-45c2-9768-ae67596b32ad',
            'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5d647844-abcf-4d28-9d81-228ab00c01cb' OR (EntityID = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18' AND Name = 'RelatedJoinField')) BEGIN
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
            '5d647844-abcf-4d28-9d81-228ab00c01cb',
            'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c8bc36e7-f6b3-4c98-9bb4-7a938f655dcd' OR (EntityID = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18' AND Name = 'ReplacesSectionKey')) BEGIN
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
            'c8bc36e7-f6b3-4c98-9bb4-7a938f655dcd',
            'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '11f0411f-df79-44ea-ac8e-d6b15ef73b46' OR (EntityID = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18' AND Name = 'ReplacesSectionKeys')) BEGIN
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
            '11f0411f-df79-44ea-ac8e-d6b15ef73b46',
            'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '918efa14-df8a-4354-9b79-59181c1991c8' OR (EntityID = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18' AND Name = 'ReplacesFieldNames')) BEGIN
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
            '918efa14-df8a-4354-9b79-59181c1991c8',
            'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9bdfa6b5-346e-4520-b752-b6a55249cdec' OR (EntityID = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18' AND Name = 'InSectionKey')) BEGIN
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
            '9bdfa6b5-346e-4520-b752-b6a55249cdec',
            'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bf27ed9f-9cfe-471e-8659-5a35cb16c05a' OR (EntityID = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18' AND Name = 'SectionPosition')) BEGIN
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
            'bf27ed9f-9cfe-471e-8659-5a35cb16c05a',
            'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd4e78e69-50ba-41d1-a694-6113ec959b21' OR (EntityID = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18' AND Name = 'Inclusion')) BEGIN
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
            'd4e78e69-50ba-41d1-a694-6113ec959b21',
            'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0ed921e1-a848-4d30-8094-d383b68995f9' OR (EntityID = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18' AND Name = 'ChromeGroup')) BEGIN
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
            '0ed921e1-a848-4d30-8094-d383b68995f9',
            'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '019c2bff-42b2-481a-ad26-5c6a2b4f3b33' OR (EntityID = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18' AND Name = 'Presentation')) BEGIN
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
            '019c2bff-42b2-481a-ad26-5c6a2b4f3b33',
            'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2d2ec821-1050-4ddb-9a44-1d70216902b1' OR (EntityID = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18' AND Name = 'Title')) BEGIN
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
            '2d2ec821-1050-4ddb-9a44-1d70216902b1',
            'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '37f126c1-25f1-4c1f-9e25-966305d5d896' OR (EntityID = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18' AND Name = 'Icon')) BEGIN
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
            '37f126c1-25f1-4c1f-9e25-966305d5d896',
            'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '13712da6-fa07-48d6-83aa-b9e25e2a430a' OR (EntityID = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18' AND Name = 'Scope')) BEGIN
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
            '13712da6-fa07-48d6-83aa-b9e25e2a430a',
            'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e20e40b6-8081-40d6-8fdc-4e83c15bfcef' OR (EntityID = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18' AND Name = 'UserID')) BEGIN
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
            'e20e40b6-8081-40d6-8fdc-4e83c15bfcef',
            'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '87cf0da5-d9b0-4356-9ab1-2bedd282e880' OR (EntityID = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18' AND Name = 'RoleID')) BEGIN
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
            '87cf0da5-d9b0-4356-9ab1-2bedd282e880',
            'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b1a4b38d-1be1-4fe0-82e2-c0dc62b73fc3' OR (EntityID = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18' AND Name = 'Precedence')) BEGIN
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
            'b1a4b38d-1be1-4fe0-82e2-c0dc62b73fc3',
            'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b88476d8-6127-448e-aac2-8d00a09b09aa' OR (EntityID = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18' AND Name = 'Status')) BEGIN
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
            'b88476d8-6127-448e-aac2-8d00a09b09aa',
            'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3dcecd60-7f4e-4c2d-b88b-0ddb93df9411' OR (EntityID = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18' AND Name = 'Configuration')) BEGIN
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
            '3dcecd60-7f4e-4c2d-b88b-0ddb93df9411',
            'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9f12e98f-81bc-49d0-8070-557c96a985db' OR (EntityID = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18' AND Name = 'Notes')) BEGIN
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
            '9f12e98f-81bc-49d0-8070-557c96a985db',
            'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bb456a10-40ca-43f8-9cc9-a7d45eedf23a' OR (EntityID = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18' AND Name = '__mj_CreatedAt')) BEGIN
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
            'bb456a10-40ca-43f8-9cc9-a7d45eedf23a',
            'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5d3b04dc-c232-4612-a28f-1e1a1e4cf279' OR (EntityID = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '5d3b04dc-c232-4612-a28f-1e1a1e4cf279',
            'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18'),
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

/* SQL text to insert entity field value with ID 6e9e9b45-46a5-421e-80d5-36210c4b6bb5 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6e9e9b45-46a5-421e-80d5-36210c4b6bb5', '3B573CDB-CE39-4C1E-9000-C9BF86DC898B', 1, 'after-everything', 'after-everything', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 556e46bc-6ac3-4dff-982b-1cb55027c4c7 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('556e46bc-6ac3-4dff-982b-1cb55027c4c7', '3B573CDB-CE39-4C1E-9000-C9BF86DC898B', 2, 'after-fields', 'after-fields', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 822bebc9-fccd-4d71-bf69-f62daf2ce92d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('822bebc9-fccd-4d71-bf69-f62daf2ce92d', '3B573CDB-CE39-4C1E-9000-C9BF86DC898B', 3, 'after-related', 'after-related', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID d2119bcd-db8c-41e4-88b5-0e43aa4bf602 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d2119bcd-db8c-41e4-88b5-0e43aa4bf602', '3B573CDB-CE39-4C1E-9000-C9BF86DC898B', 4, 'before-fields', 'before-fields', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID f34edc0e-941e-4218-87f4-072989f37701 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f34edc0e-941e-4218-87f4-072989f37701', '3B573CDB-CE39-4C1E-9000-C9BF86DC898B', 5, 'top-area', 'top-area', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 3B573CDB-CE39-4C1E-9000-C9BF86DC898B */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='3B573CDB-CE39-4C1E-9000-C9BF86DC898B';

/* SQL text to insert entity field value with ID e27c401d-c51f-4578-b426-f0ce041ddbd4 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e27c401d-c51f-4578-b426-f0ce041ddbd4', 'D4E78E69-50BA-41D1-A694-6113EC959B21', 1, 'More', 'More', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 2729ce67-db83-4a5b-b20b-3969b60d17a0 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2729ce67-db83-4a5b-b20b-3969b60d17a0', 'D4E78E69-50BA-41D1-A694-6113EC959B21', 2, 'None', 'None', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 5165dc60-04ee-4629-bcc5-c3f646100a55 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5165dc60-04ee-4629-bcc5-c3f646100a55', 'D4E78E69-50BA-41D1-A694-6113EC959B21', 3, 'Primary', 'Primary', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID D4E78E69-50BA-41D1-A694-6113EC959B21 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='D4E78E69-50BA-41D1-A694-6113EC959B21';

/* SQL text to insert entity field value with ID 3e32e84a-0fe7-449b-8a12-cbeedca9c3ac */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3e32e84a-0fe7-449b-8a12-cbeedca9c3ac', '0ED921E1-A848-4D30-8094-D383B68995F9', 1, 'details', 'details', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 74c4b64e-1c27-429e-98fc-c55f44505084 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('74c4b64e-1c27-429e-98fc-c55f44505084', '0ED921E1-A848-4D30-8094-D383B68995F9', 2, 'more', 'more', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 0ED921E1-A848-4D30-8094-D383B68995F9 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='0ED921E1-A848-4D30-8094-D383B68995F9';

/* SQL text to insert entity field value with ID 4b901b1d-f907-44dc-be7d-e8d37a6689c3 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4b901b1d-f907-44dc-be7d-e8d37a6689c3', '019C2BFF-42B2-481A-AD26-5C6A2B4F3B33', 1, 'bare', 'bare', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 26af7a53-4a25-4dba-89e8-d6a8ae0ed3af */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('26af7a53-4a25-4dba-89e8-d6a8ae0ed3af', '019C2BFF-42B2-481A-AD26-5C6A2B4F3B33', 2, 'panel', 'panel', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 019C2BFF-42B2-481A-AD26-5C6A2B4F3B33 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='019C2BFF-42B2-481A-AD26-5C6A2B4F3B33';

/* SQL text to insert entity field value with ID c9ff1fa7-2a38-4306-9e07-782b1ab00465 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c9ff1fa7-2a38-4306-9e07-782b1ab00465', '13712DA6-FA07-48D6-83AA-B9E25E2A430A', 1, 'Global', 'Global', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID bda47a66-ae88-413a-8827-38f31c74a184 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('bda47a66-ae88-413a-8827-38f31c74a184', '13712DA6-FA07-48D6-83AA-B9E25E2A430A', 2, 'Role', 'Role', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 6b076ace-cac3-4ae3-b9bf-fa8d4e8fb4b9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6b076ace-cac3-4ae3-b9bf-fa8d4e8fb4b9', '13712DA6-FA07-48D6-83AA-B9E25E2A430A', 3, 'User', 'User', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 13712DA6-FA07-48D6-83AA-B9E25E2A430A */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='13712DA6-FA07-48D6-83AA-B9E25E2A430A';

/* SQL text to insert entity field value with ID 53918b55-2223-4725-bf53-4957f4726ddd */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('53918b55-2223-4725-bf53-4957f4726ddd', 'B88476D8-6127-448E-AAC2-8D00A09B09AA', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 0333bff9-3af2-417a-922b-cd49c57e124c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0333bff9-3af2-417a-922b-cd49c57e124c', 'B88476D8-6127-448E-AAC2-8D00A09B09AA', 2, 'Inactive', 'Inactive', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 8e2aa13b-e7bc-41bd-81d5-7eac4972a969 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8e2aa13b-e7bc-41bd-81d5-7eac4972a969', 'B88476D8-6127-448E-AAC2-8D00A09B09AA', 3, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID B88476D8-6127-448E-AAC2-8D00A09B09AA */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='B88476D8-6127-448E-AAC2-8D00A09B09AA';

/* SQL text to insert entity field value with ID 5c82a503-a896-4547-8ddb-5a79f815671f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5c82a503-a896-4547-8ddb-5a79f815671f', 'BF27ED9F-9CFE-471E-8659-5A35CB16C05A', 1, 'end', 'end', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 9f6e56eb-49bb-4039-8343-26474c3cdf18 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9f6e56eb-49bb-4039-8343-26474c3cdf18', 'BF27ED9F-9CFE-471E-8659-5A35CB16C05A', 2, 'start', 'start', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID BF27ED9F-9CFE-471E-8659-5A35CB16C05A */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='BF27ED9F-9CFE-471E-8659-5A35CB16C05A';


/* Create Entity Relationship: MJ: Roles -> MJ: Entity Form Contributions (One To Many via RoleID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '21ce9131-a318-40ea-8bb9-a01764b7572b'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('21ce9131-a318-40ea-8bb9-a01764b7572b', 'DA238F34-2837-EF11-86D4-6045BDEE16E6', 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18', 'RoleID', 'One To Many', 1, 1, 18, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Entities -> MJ: Entity Form Contributions (One To Many via EntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'f39f155b-a6f2-4123-92c1-c18ed70264c6'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('f39f155b-a6f2-4123-92c1-c18ed70264c6', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18', 'EntityID', 'One To Many', 1, 1, 80, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Entities -> MJ: Entity Form Contributions (One To Many via RelatedEntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '666a6e09-3f29-4b44-81e6-339bb692ec74'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('666a6e09-3f29-4b44-81e6-339bb692ec74', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18', 'RelatedEntityID', 'One To Many', 1, 1, 81, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ: Entity Form Contributions (One To Many via UserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '01ea85bf-8dfb-4bdc-8ebe-aa9d8e28466e'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('01ea85bf-8dfb-4bdc-8ebe-aa9d8e28466e', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18', 'UserID', 'One To Many', 1, 1, 108, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Components -> MJ: Entity Form Contributions (One To Many via ComponentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '58268626-f742-4079-999d-49a22c42e900'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('58268626-f742-4079-999d-49a22c42e900', '0FB98A1D-C6AE-4427-B66C-7B31E669756F', 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18', 'ComponentID', 'One To Many', 1, 1, 5, GETUTCDATE(), GETUTCDATE())
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

/* SQL text to update entity field related entity name field map for entity field ID B91BF4E8-2FD8-4648-98A9-DCB42F1DF112 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='B91BF4E8-2FD8-4648-98A9-DCB42F1DF112', @RelatedEntityNameFieldMap='Entity';

/* SQL text to update entity field related entity name field map for entity field ID 5515D72A-25D8-48B2-BDE7-A7394491F474 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='5515D72A-25D8-48B2-BDE7-A7394491F474', @RelatedEntityNameFieldMap='Component';

/* SQL text to update entity field related entity name field map for entity field ID 962E5C3F-10F2-45C2-9768-AE67596B32AD */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='962E5C3F-10F2-45C2-9768-AE67596B32AD', @RelatedEntityNameFieldMap='RelatedEntity';

/* SQL text to update entity field related entity name field map for entity field ID E20E40B6-8081-40D6-8FDC-4E83C15BFCEF */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='E20E40B6-8081-40D6-8FDC-4E83C15BFCEF', @RelatedEntityNameFieldMap='User';

/* SQL text to update entity field related entity name field map for entity field ID 87CF0DA5-D9B0-4356-9AB1-2BEDD282E880 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='87CF0DA5-D9B0-4356-9AB1-2BEDD282E880', @RelatedEntityNameFieldMap='Role';

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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '26bd4191-32f5-4614-add4-8ba4cf8e8736' OR (EntityID = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18' AND Name = 'Entity')) BEGIN
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
            '26bd4191-32f5-4614-add4-8ba4cf8e8736',
            'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b5a9ed46-4282-4fd9-8270-f2ea15bb0b47' OR (EntityID = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18' AND Name = 'Component')) BEGIN
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
            'b5a9ed46-4282-4fd9-8270-f2ea15bb0b47',
            'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7676766f-f5fa-43ee-8ea0-aa115e640dab' OR (EntityID = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18' AND Name = 'RelatedEntity')) BEGIN
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
            '7676766f-f5fa-43ee-8ea0-aa115e640dab',
            'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cedb3788-a87b-4b99-b0b4-0eedc898af51' OR (EntityID = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18' AND Name = 'User')) BEGIN
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
            'cedb3788-a87b-4b99-b0b4-0eedc898af51',
            'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b1517f82-8775-43f7-8ecf-f16519009206' OR (EntityID = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18' AND Name = 'Role')) BEGIN
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
            'b1517f82-8775-43f7-8ecf-f16519009206',
            'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18'),
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
               WHERE ID = '3B573CDB-CE39-4C1E-9000-C9BF86DC898B'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B88476D8-6127-448E-AAC2-8D00A09B09AA'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '26BD4191-32F5-4614-ADD4-8BA4CF8E8736'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B5A9ED46-4282-4FD9-8270-F2EA15BB0B47'
               AND AutoUpdateDefaultInView = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 0
            WHERE ID = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set categories for 33 fields */

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.EntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Form Integration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Parent Entity'
WHERE 
   ID = 'B91BF4E8-2FD8-4648-98A9-DCB42F1DF112';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.ComponentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Form Integration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Component'
WHERE 
   ID = '5515D72A-25D8-48B2-BDE7-A7394491F474';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Form Integration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '54D82F2F-529D-47CD-961C-A6B67B1C3AB9';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Form Integration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '81AE8859-CADE-49D2-A03A-A9DC95135F96';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Slot 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Placement and Layout',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '3B573CDB-CE39-4C1E-9000-C9BF86DC898B';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.SortKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Placement and Layout',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '56033CAE-CF1C-467D-BBB9-DB9E61B2EC83';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.ContributionKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Placement and Layout',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C3E75F52-BF6B-44B3-AF86-2A4A6182CF14';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.RelatedEntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Replacement Logic',
   GeneratedFormSection = 'Category',
   DisplayName = 'Related Entity'
WHERE 
   ID = '962E5C3F-10F2-45C2-9768-AE67596B32AD';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.RelatedJoinField 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Replacement Logic',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '5D647844-ABCF-4D28-9D81-228AB00C01CB';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.ReplacesSectionKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Replacement Logic',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C8BC36E7-F6B3-4C98-9BB4-7A938F655DCD';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.ReplacesSectionKeys 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Replacement Logic',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '11F0411F-DF79-44EA-AC8E-D6B15EF73B46';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.ReplacesFieldNames 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Replacement Logic',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '918EFA14-DF8A-4354-9B79-59181C1991C8';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.InSectionKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Replacement Logic',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '9BDFA6B5-346E-4520-B752-B6A55249CDEC';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.SectionPosition 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Replacement Logic',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'BF27ED9F-9CFE-471E-8659-5A35CB16C05A';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Inclusion 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Chrome and Presentation',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'D4E78E69-50BA-41D1-A694-6113EC959B21';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.ChromeGroup 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Chrome and Presentation',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '0ED921E1-A848-4D30-8094-D383B68995F9';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Presentation 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Chrome and Presentation',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '019C2BFF-42B2-481A-AD26-5C6A2B4F3B33';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Title 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Chrome and Presentation',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '2D2EC821-1050-4DDB-9A44-1D70216902B1';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Icon 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Chrome and Presentation',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Icon'
WHERE 
   ID = '37F126C1-25F1-4C1F-9E25-966305D5D896';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Scope 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Access Control',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '13712DA6-FA07-48D6-83AA-B9E25E2A430A';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.UserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Access Control',
   GeneratedFormSection = 'Category',
   DisplayName = 'User'
WHERE 
   ID = 'E20E40B6-8081-40D6-8FDC-4E83C15BFCEF';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.RoleID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Access Control',
   GeneratedFormSection = 'Category',
   DisplayName = 'Role'
WHERE 
   ID = '87CF0DA5-D9B0-4356-9AB1-2BEDD282E880';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Precedence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Access Control',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'B1A4B38D-1BE1-4FE0-82E2-C0DC62B73FC3';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Access Control',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'B88476D8-6127-448E-AAC2-8D00A09B09AA';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Configuration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Access Control',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '3DCECD60-7F4E-4C2D-B88B-0DDB93DF9411';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Notes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '9F12E98F-81BC-49D0-8070-557C96A985DB';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'BB456A10-40CA-43F8-9CC9-A7D45EEDF23A';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '5D3B04DC-C232-4612-A28F-1E1A1E4CF279';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Entity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '26BD4191-32F5-4614-ADD4-8BA4CF8E8736';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Component 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'B5A9ED46-4282-4FD9-8270-F2EA15BB0B47';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.RelatedEntity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '7676766F-F5FA-43EE-8EA0-AA115E640DAB';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.User 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'CEDB3788-A87B-4B99-B0B4-0EEDC898AF51';

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Role 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'B1517F82-8775-43F7-8ECF-F16519009206';

/* Set entity icon to fa fa-puzzle-piece */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-puzzle-piece', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('d76f3f72-cfb3-5b39-bfda-7f39f023e928', 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18', 'FieldCategoryInfo', '{
  "Access Control": {
    "description": "Visibility scope, status, and precedence rules",
    "icon": "fa fa-shield-alt"
  },
  "Chrome and Presentation": {
    "description": "Visual styling and UI component wrapper settings",
    "icon": "fa fa-palette"
  },
  "Form Integration": {
    "description": "Core configuration linking components to parent entities",
    "icon": "fa fa-puzzle-piece"
  },
  "Placement and Layout": {
    "description": "Settings for positioning the panel on the form",
    "icon": "fa fa-th-large"
  },
  "Replacement Logic": {
    "description": "Rules for overriding existing sections or fields",
    "icon": "fa fa-exchange-alt"
  },
  "System Metadata": {
    "description": "Audit logs and system-managed reference data",
    "icon": "fa fa-database"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('3c44348f-f9d0-505b-9ca7-eeccd75b77ef', 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18', 'FieldCategoryIcons', '{
  "Access Control": "fa fa-shield-alt",
  "Chrome and Presentation": "fa fa-palette",
  "Form Integration": "fa fa-puzzle-piece",
  "Placement and Layout": "fa fa-th-large",
  "Replacement Logic": "fa fa-exchange-alt",
  "System Metadata": "fa fa-database"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18';

/* Generated Validation Functions for MJ: Entity Form Contributions */
-- CHECK constraint for MJ: Entity Form Contributions: Field: ReplacesFieldNames was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '918EFA14-DF8A-4354-9B79-59181C1991C8'
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
}', 'If Replaces Field Names is provided, it must be a valid, non-empty JSON array of field names.', 'ValidateReplacesFieldNamesIsNonEmptyJsonArray', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '918EFA14-DF8A-4354-9B79-59181C1991C8')
   END;

-- CHECK constraint for MJ: Entity Form Contributions: Field: ReplacesSectionKeys was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '11F0411F-DF79-44EA-AC8E-D6B15EF73B46'
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
}', 'If Replaces Section Keys is provided, it must be a valid JSON array containing at least one element. It cannot be empty or just an empty array structure.', 'ValidateReplacesSectionKeysIsNonEmptyJsonArray', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '11F0411F-DF79-44EA-AC8E-D6B15EF73B46')
   END;

-- CHECK constraint for MJ: Entity Form Contributions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18'
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
}', 'Only one of the following fields can be set at a time: Replaces Section Key, Related Entity ID, Replaces Field Names, Replaces Section Keys, or In Section Key. This prevents conflicting configuration definitions.', 'ValidateMutuallyExclusiveReplacementAndRelationshipFields', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18')
   END;

-- CHECK constraint for MJ: Entity Form Contributions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18'
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
}', 'If the presentation style is set to ''bare'', then both Inclusion and ChromeGroup must be left empty.', 'ValidatePresentationBareInclusionAndChromeGroup', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18')
   END;

-- CHECK constraint for MJ: Entity Form Contributions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18'
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
}', 'If a Related Join Field is specified, a Related Entity must also be provided to ensure the join field has a valid target entity.', 'ValidateRelatedJoinFieldRequiresRelatedEntityID', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18')
   END;

-- CHECK constraint for MJ: Entity Form Contributions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18'
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
}', 'Ensures that the assigned User or Role matches the selected Scope. A ''User'' scope requires a User ID and no Role ID, a ''Role'' scope requires a Role ID and no User ID, and a ''Global'' scope requires both User ID and Role ID to be empty.', 'ValidateScopeAssociations', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18')
   END;

-- CHECK constraint for MJ: Entity Form Contributions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18'
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
}', 'If a Section Position is specified, either the Replaces Field Names or the In Section Key must also be provided to define the context of the position.', 'ValidateSectionPositionDependencies', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'CC48DE93-71EE-403E-B5B9-AD5BDFAABC18')
   END;

