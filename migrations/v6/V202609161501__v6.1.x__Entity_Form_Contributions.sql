/* ============================================================================
   MJ: Entity Form Contributions — metadata-registered form contributions

   One row mounts a `componentRole: 'form-panel'` Component (Type='Widget') on a
   parent entity's form at a slot, optionally claiming a related grid or replacing
   a baked field panel. Peer of compiled BaseFormPanel registrations: the same
   composer, chrome layers and MJ: Form Chrome Rules apply.

   CodeGen handles automatically (intentionally omitted):
     - __mj_CreatedAt / __mj_UpdatedAt columns + triggers
     - Foreign-key indexes (IDX_AUTO_MJ_FKEY_*)
     - Entity / EntityField metadata ("MJ: Entity Form Contributions")
   ============================================================================ */

CREATE TABLE ${flyway:defaultSchema}.EntityFormContribution (
    ID                 UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    EntityID           UNIQUEIDENTIFIER NOT NULL,
    ComponentID        UNIQUEIDENTIFIER NOT NULL,
    Name               NVARCHAR(255)    NOT NULL,
    Description        NVARCHAR(MAX)    NULL,
    Slot               NVARCHAR(30)     NOT NULL DEFAULT 'after-fields',
    SortKey            INT              NOT NULL DEFAULT 0,
    ContributionKey    NVARCHAR(256)    NULL,
    RelatedEntityID    UNIQUEIDENTIFIER NULL,
    RelatedJoinField   NVARCHAR(255)    NULL,
    ReplacesSectionKey NVARCHAR(255)    NULL,
    Inclusion          NVARCHAR(10)     NULL,
    ChromeGroup        NVARCHAR(10)     NULL,
    Presentation       NVARCHAR(10)     NOT NULL DEFAULT 'panel',
    Title              NVARCHAR(255)    NULL,
    Icon               NVARCHAR(100)    NULL,
    Scope              NVARCHAR(20)     NOT NULL DEFAULT 'User',
    UserID             UNIQUEIDENTIFIER NULL,
    RoleID             UNIQUEIDENTIFIER NULL,
    Precedence         INT              NOT NULL DEFAULT 0,
    Status             NVARCHAR(20)     NOT NULL DEFAULT 'Pending',
    Configuration      NVARCHAR(MAX)    NULL,
    Notes              NVARCHAR(MAX)    NULL,

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
    -- One contribution claims one thing: a related grid or a baked section, not both.
    CONSTRAINT CK_EntityFormContribution_OneClaim
        CHECK (ReplacesSectionKey IS NULL OR RelatedEntityID IS NULL)
);

CREATE UNIQUE INDEX UQ_EntityFormContribution_Key
    ON ${flyway:defaultSchema}.EntityFormContribution (EntityID, ContributionKey, Scope, UserID, RoleID)
    WHERE ContributionKey IS NOT NULL AND Status = 'Active';

-- Keyless related claims derive `related:<entity>:<join>` at runtime, so the index above
-- (ContributionKey IS NOT NULL) does not see them. Without this one, two Active rows can
-- claim the same grid and the winner is decided by row order.
CREATE UNIQUE INDEX UQ_EntityFormContribution_RelatedClaim
    ON ${flyway:defaultSchema}.EntityFormContribution (EntityID, RelatedEntityID, RelatedJoinField, Scope, UserID, RoleID)
    WHERE ContributionKey IS NULL AND RelatedEntityID IS NOT NULL AND Status = 'Active';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Metadata-registered form contribution: mounts a form-panel Component on a parent entity''s form at a slot, optionally claiming a related grid or replacing a baked field panel. Peer of compiled BaseFormPanel registrations.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityFormContribution';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Parent form entity the panel mounts on.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'EntityID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'MJ: Components row (Type=Widget) whose Specification declares componentRole=form-panel.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'ComponentID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Slot inside the generated form: top-area, before-fields, after-fields, after-related, after-everything.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'Slot';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Higher renders earlier within the slot.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'SortKey';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Last-wins identity shared with compiled registrations and MJ: Form Chrome Rules. Null derives related:<entity>:<join> for related claims, otherwise the row never collapses.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'ContributionKey';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'When set, this panel replaces the related-entity grid for that relationship on the parent form.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'RelatedEntityID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Disambiguates two FKs to the same related entity (BillToPersonID vs ShipToPersonID).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'RelatedJoinField';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'CodeGen SectionKey of a baked field panel this contribution hides (hero pattern).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'ReplacesSectionKey';
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




















































/* ============================================================================
   GENERATED BY CODEGEN — DO NOT EDIT BELOW THIS LINE

   Appended from the CodeGen run that followed the DDL above: entity + field
   metadata, base view, CRUD procedures and permissions for
   MJ: Entity Form Contributions.
   ============================================================================ */

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
         'cfc1acd7-223c-423f-9777-959ec95db70e',
         'MJ: Entity Form Contributions',
         'Entity Form Contributions',
         'Metadata-registered form contribution: mounts a form-panel Component on a parent entity''s form at a slot, optionally claiming a related grid or replacing a baked field panel. Peer of compiled BaseFormPanel registrations.',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'cfc1acd7-223c-423f-9777-959ec95db70e', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Entity Form Contributions for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('cfc1acd7-223c-423f-9777-959ec95db70e', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Entity Form Contributions for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('cfc1acd7-223c-423f-9777-959ec95db70e', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Entity Form Contributions for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('cfc1acd7-223c-423f-9777-959ec95db70e', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

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

/* SQL text to insert 26 new entity field(s) */
UPDATE [${flyway:defaultSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = 'CFC1ACD7-223C-423F-9777-959EC95DB70E'
         AND [Sequence] < 100000
         AND NOT EXISTS (
             SELECT 1 FROM [${flyway:defaultSchema}].[EntityField]
              WHERE [EntityID] = 'CFC1ACD7-223C-423F-9777-959EC95DB70E'
                AND [Sequence] >= 100000
         );

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2350a80b-2304-4839-ad52-bb6cf27f18a1' OR (EntityID = 'CFC1ACD7-223C-423F-9777-959EC95DB70E' AND Name = 'ID')) BEGIN
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
            '2350a80b-2304-4839-ad52-bb6cf27f18a1',
            'CFC1ACD7-223C-423F-9777-959EC95DB70E', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CFC1ACD7-223C-423F-9777-959EC95DB70E') + 1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a59e74dc-743b-41ae-af37-ae846f53aa9e' OR (EntityID = 'CFC1ACD7-223C-423F-9777-959EC95DB70E' AND Name = 'EntityID')) BEGIN
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
            'a59e74dc-743b-41ae-af37-ae846f53aa9e',
            'CFC1ACD7-223C-423F-9777-959EC95DB70E', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CFC1ACD7-223C-423F-9777-959EC95DB70E') + 2,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ded4ac99-ddfc-4b49-9d80-130323d1871a' OR (EntityID = 'CFC1ACD7-223C-423F-9777-959EC95DB70E' AND Name = 'ComponentID')) BEGIN
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
            'ded4ac99-ddfc-4b49-9d80-130323d1871a',
            'CFC1ACD7-223C-423F-9777-959EC95DB70E', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CFC1ACD7-223C-423F-9777-959EC95DB70E') + 3,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '36ae0495-155a-45ef-8a6d-fa9a7b15263b' OR (EntityID = 'CFC1ACD7-223C-423F-9777-959EC95DB70E' AND Name = 'Name')) BEGIN
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
            '36ae0495-155a-45ef-8a6d-fa9a7b15263b',
            'CFC1ACD7-223C-423F-9777-959EC95DB70E', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CFC1ACD7-223C-423F-9777-959EC95DB70E') + 4,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b67f32fd-1813-4064-b3e9-9361f8e067ea' OR (EntityID = 'CFC1ACD7-223C-423F-9777-959EC95DB70E' AND Name = 'Description')) BEGIN
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
            'b67f32fd-1813-4064-b3e9-9361f8e067ea',
            'CFC1ACD7-223C-423F-9777-959EC95DB70E', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CFC1ACD7-223C-423F-9777-959EC95DB70E') + 5,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4a9b7ba6-1c72-4ae1-9c44-97377b38aa18' OR (EntityID = 'CFC1ACD7-223C-423F-9777-959EC95DB70E' AND Name = 'Slot')) BEGIN
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
            '4a9b7ba6-1c72-4ae1-9c44-97377b38aa18',
            'CFC1ACD7-223C-423F-9777-959EC95DB70E', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CFC1ACD7-223C-423F-9777-959EC95DB70E') + 6,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '39fba246-801e-4dd4-95d0-f50abf4b3293' OR (EntityID = 'CFC1ACD7-223C-423F-9777-959EC95DB70E' AND Name = 'SortKey')) BEGIN
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
            '39fba246-801e-4dd4-95d0-f50abf4b3293',
            'CFC1ACD7-223C-423F-9777-959EC95DB70E', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CFC1ACD7-223C-423F-9777-959EC95DB70E') + 7,
            'SortKey',
            'Sort Key',
            'Higher renders earlier within the slot.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bcac9df0-8ede-440a-b84f-950b4843ca1b' OR (EntityID = 'CFC1ACD7-223C-423F-9777-959EC95DB70E' AND Name = 'ContributionKey')) BEGIN
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
            'bcac9df0-8ede-440a-b84f-950b4843ca1b',
            'CFC1ACD7-223C-423F-9777-959EC95DB70E', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CFC1ACD7-223C-423F-9777-959EC95DB70E') + 8,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5667d9ed-5761-4019-9d49-cad0528de58e' OR (EntityID = 'CFC1ACD7-223C-423F-9777-959EC95DB70E' AND Name = 'RelatedEntityID')) BEGIN
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
            '5667d9ed-5761-4019-9d49-cad0528de58e',
            'CFC1ACD7-223C-423F-9777-959EC95DB70E', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CFC1ACD7-223C-423F-9777-959EC95DB70E') + 9,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c817aa84-dcb6-40d6-8125-494ad65435eb' OR (EntityID = 'CFC1ACD7-223C-423F-9777-959EC95DB70E' AND Name = 'RelatedJoinField')) BEGIN
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
            'c817aa84-dcb6-40d6-8125-494ad65435eb',
            'CFC1ACD7-223C-423F-9777-959EC95DB70E', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CFC1ACD7-223C-423F-9777-959EC95DB70E') + 10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b195f0f2-c22f-430f-960d-9da2f97e5d1d' OR (EntityID = 'CFC1ACD7-223C-423F-9777-959EC95DB70E' AND Name = 'ReplacesSectionKey')) BEGIN
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
            'b195f0f2-c22f-430f-960d-9da2f97e5d1d',
            'CFC1ACD7-223C-423F-9777-959EC95DB70E', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CFC1ACD7-223C-423F-9777-959EC95DB70E') + 11,
            'ReplacesSectionKey',
            'Replaces Section Key',
            'CodeGen SectionKey of a baked field panel this contribution hides (hero pattern).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd33a262a-6a9d-4b9b-beea-28bbec3a2c33' OR (EntityID = 'CFC1ACD7-223C-423F-9777-959EC95DB70E' AND Name = 'Inclusion')) BEGIN
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
            'd33a262a-6a9d-4b9b-beea-28bbec3a2c33',
            'CFC1ACD7-223C-423F-9777-959EC95DB70E', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CFC1ACD7-223C-423F-9777-959EC95DB70E') + 12,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0e4a74ce-b623-4b12-a30d-ffe70d8984c1' OR (EntityID = 'CFC1ACD7-223C-423F-9777-959EC95DB70E' AND Name = 'ChromeGroup')) BEGIN
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
            '0e4a74ce-b623-4b12-a30d-ffe70d8984c1',
            'CFC1ACD7-223C-423F-9777-959EC95DB70E', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CFC1ACD7-223C-423F-9777-959EC95DB70E') + 13,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '884f230f-d557-4c21-ae55-630018799ab9' OR (EntityID = 'CFC1ACD7-223C-423F-9777-959EC95DB70E' AND Name = 'Presentation')) BEGIN
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
            '884f230f-d557-4c21-ae55-630018799ab9',
            'CFC1ACD7-223C-423F-9777-959EC95DB70E', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CFC1ACD7-223C-423F-9777-959EC95DB70E') + 14,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2668d98f-879c-468d-8a54-2035eaa722fa' OR (EntityID = 'CFC1ACD7-223C-423F-9777-959EC95DB70E' AND Name = 'Title')) BEGIN
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
            '2668d98f-879c-468d-8a54-2035eaa722fa',
            'CFC1ACD7-223C-423F-9777-959EC95DB70E', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CFC1ACD7-223C-423F-9777-959EC95DB70E') + 15,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '67ee9e8f-b365-4acd-ae9e-e8a021eb93ea' OR (EntityID = 'CFC1ACD7-223C-423F-9777-959EC95DB70E' AND Name = 'Icon')) BEGIN
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
            '67ee9e8f-b365-4acd-ae9e-e8a021eb93ea',
            'CFC1ACD7-223C-423F-9777-959EC95DB70E', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CFC1ACD7-223C-423F-9777-959EC95DB70E') + 16,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c872da59-9353-412b-84a1-8b87029279ad' OR (EntityID = 'CFC1ACD7-223C-423F-9777-959EC95DB70E' AND Name = 'Scope')) BEGIN
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
            'c872da59-9353-412b-84a1-8b87029279ad',
            'CFC1ACD7-223C-423F-9777-959EC95DB70E', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CFC1ACD7-223C-423F-9777-959EC95DB70E') + 17,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3bcab356-5436-42c4-807b-acfb454614fc' OR (EntityID = 'CFC1ACD7-223C-423F-9777-959EC95DB70E' AND Name = 'UserID')) BEGIN
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
            '3bcab356-5436-42c4-807b-acfb454614fc',
            'CFC1ACD7-223C-423F-9777-959EC95DB70E', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CFC1ACD7-223C-423F-9777-959EC95DB70E') + 18,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6f12e3b3-2328-45ca-852f-bbe56686606f' OR (EntityID = 'CFC1ACD7-223C-423F-9777-959EC95DB70E' AND Name = 'RoleID')) BEGIN
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
            '6f12e3b3-2328-45ca-852f-bbe56686606f',
            'CFC1ACD7-223C-423F-9777-959EC95DB70E', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CFC1ACD7-223C-423F-9777-959EC95DB70E') + 19,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c968b7c3-59f7-419d-9829-bde75a4d16a9' OR (EntityID = 'CFC1ACD7-223C-423F-9777-959EC95DB70E' AND Name = 'Precedence')) BEGIN
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
            'c968b7c3-59f7-419d-9829-bde75a4d16a9',
            'CFC1ACD7-223C-423F-9777-959EC95DB70E', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CFC1ACD7-223C-423F-9777-959EC95DB70E') + 20,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b6d0120b-2a59-44e7-acaf-d309b1f6f1a5' OR (EntityID = 'CFC1ACD7-223C-423F-9777-959EC95DB70E' AND Name = 'Status')) BEGIN
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
            'b6d0120b-2a59-44e7-acaf-d309b1f6f1a5',
            'CFC1ACD7-223C-423F-9777-959EC95DB70E', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CFC1ACD7-223C-423F-9777-959EC95DB70E') + 21,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd2da8a56-01aa-43c0-8853-95475c3c77d1' OR (EntityID = 'CFC1ACD7-223C-423F-9777-959EC95DB70E' AND Name = 'Configuration')) BEGIN
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
            'd2da8a56-01aa-43c0-8853-95475c3c77d1',
            'CFC1ACD7-223C-423F-9777-959EC95DB70E', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CFC1ACD7-223C-423F-9777-959EC95DB70E') + 22,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cae3a388-e96d-432c-a642-4a4186994688' OR (EntityID = 'CFC1ACD7-223C-423F-9777-959EC95DB70E' AND Name = 'Notes')) BEGIN
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
            'cae3a388-e96d-432c-a642-4a4186994688',
            'CFC1ACD7-223C-423F-9777-959EC95DB70E', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CFC1ACD7-223C-423F-9777-959EC95DB70E') + 23,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bb25ed8f-6033-4ae2-bf73-2cc92a690de9' OR (EntityID = 'CFC1ACD7-223C-423F-9777-959EC95DB70E' AND Name = '__mj_CreatedAt')) BEGIN
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
            'bb25ed8f-6033-4ae2-bf73-2cc92a690de9',
            'CFC1ACD7-223C-423F-9777-959EC95DB70E', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CFC1ACD7-223C-423F-9777-959EC95DB70E') + 24,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '16217bfa-1c9d-43b1-a5a0-43a71c692748' OR (EntityID = 'CFC1ACD7-223C-423F-9777-959EC95DB70E' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '16217bfa-1c9d-43b1-a5a0-43a71c692748',
            'CFC1ACD7-223C-423F-9777-959EC95DB70E', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CFC1ACD7-223C-423F-9777-959EC95DB70E') + 25,
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

/* SQL text to insert entity field value with ID 1561030f-6189-4e12-b729-97855d09e08f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1561030f-6189-4e12-b729-97855d09e08f', '4A9B7BA6-1C72-4AE1-9C44-97377B38AA18', 1, 'after-everything', 'after-everything', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID e45de9dd-f264-4b34-98aa-4e14f30c2af8 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e45de9dd-f264-4b34-98aa-4e14f30c2af8', '4A9B7BA6-1C72-4AE1-9C44-97377B38AA18', 2, 'after-fields', 'after-fields', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 56e9ebc1-ad43-4725-8ca4-de4fb4a93935 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('56e9ebc1-ad43-4725-8ca4-de4fb4a93935', '4A9B7BA6-1C72-4AE1-9C44-97377B38AA18', 3, 'after-related', 'after-related', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 4f68076a-f1fd-4f5b-a667-458d6a48115a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4f68076a-f1fd-4f5b-a667-458d6a48115a', '4A9B7BA6-1C72-4AE1-9C44-97377B38AA18', 4, 'before-fields', 'before-fields', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 0c242ab3-da34-4f5a-9b0c-b08bfa45cbff */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0c242ab3-da34-4f5a-9b0c-b08bfa45cbff', '4A9B7BA6-1C72-4AE1-9C44-97377B38AA18', 5, 'top-area', 'top-area', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 4A9B7BA6-1C72-4AE1-9C44-97377B38AA18 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='4A9B7BA6-1C72-4AE1-9C44-97377B38AA18';

/* SQL text to insert entity field value with ID 10078763-d8ad-4343-810b-ca6c84933800 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('10078763-d8ad-4343-810b-ca6c84933800', 'D33A262A-6A9D-4B9B-BEEA-28BBEC3A2C33', 1, 'More', 'More', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID d7ec402a-4d96-4580-8996-d8bb8549e13c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d7ec402a-4d96-4580-8996-d8bb8549e13c', 'D33A262A-6A9D-4B9B-BEEA-28BBEC3A2C33', 2, 'None', 'None', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID a6f95108-362f-4a98-bd57-bc8123810b67 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a6f95108-362f-4a98-bd57-bc8123810b67', 'D33A262A-6A9D-4B9B-BEEA-28BBEC3A2C33', 3, 'Primary', 'Primary', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID D33A262A-6A9D-4B9B-BEEA-28BBEC3A2C33 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='D33A262A-6A9D-4B9B-BEEA-28BBEC3A2C33';

/* SQL text to insert entity field value with ID 4772dad5-dd66-4f10-9e7c-a7fbf3f42155 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4772dad5-dd66-4f10-9e7c-a7fbf3f42155', '0E4A74CE-B623-4B12-A30D-FFE70D8984C1', 1, 'details', 'details', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 3f530f6e-4cd7-433b-a185-9e4d097b3be7 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3f530f6e-4cd7-433b-a185-9e4d097b3be7', '0E4A74CE-B623-4B12-A30D-FFE70D8984C1', 2, 'more', 'more', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 0E4A74CE-B623-4B12-A30D-FFE70D8984C1 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='0E4A74CE-B623-4B12-A30D-FFE70D8984C1';

/* SQL text to insert entity field value with ID 2798ac8c-f1c0-4b80-91d1-4a9778da6b9a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2798ac8c-f1c0-4b80-91d1-4a9778da6b9a', '884F230F-D557-4C21-AE55-630018799AB9', 1, 'bare', 'bare', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID f6edfe4e-76f3-442d-9a4f-78c30f8e011b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f6edfe4e-76f3-442d-9a4f-78c30f8e011b', '884F230F-D557-4C21-AE55-630018799AB9', 2, 'panel', 'panel', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 884F230F-D557-4C21-AE55-630018799AB9 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='884F230F-D557-4C21-AE55-630018799AB9';

/* SQL text to insert entity field value with ID 42e26a39-d488-46d3-8301-6d4309d7eb3f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('42e26a39-d488-46d3-8301-6d4309d7eb3f', 'C872DA59-9353-412B-84A1-8B87029279AD', 1, 'Global', 'Global', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 0f8a0744-b202-4958-b93d-8ae173c9d058 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0f8a0744-b202-4958-b93d-8ae173c9d058', 'C872DA59-9353-412B-84A1-8B87029279AD', 2, 'Role', 'Role', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID f9f1edc1-1546-4cf3-ac24-b4056bc89e7f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f9f1edc1-1546-4cf3-ac24-b4056bc89e7f', 'C872DA59-9353-412B-84A1-8B87029279AD', 3, 'User', 'User', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID C872DA59-9353-412B-84A1-8B87029279AD */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='C872DA59-9353-412B-84A1-8B87029279AD';

/* SQL text to insert entity field value with ID 7b02bfce-8bcd-447c-96bb-cf406ac81259 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7b02bfce-8bcd-447c-96bb-cf406ac81259', 'B6D0120B-2A59-44E7-ACAF-D309B1F6F1A5', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 523d1f33-297a-4aff-9343-676b879ef361 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('523d1f33-297a-4aff-9343-676b879ef361', 'B6D0120B-2A59-44E7-ACAF-D309B1F6F1A5', 2, 'Inactive', 'Inactive', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 459f1611-0261-4afe-b56e-f742495ce358 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('459f1611-0261-4afe-b56e-f742495ce358', 'B6D0120B-2A59-44E7-ACAF-D309B1F6F1A5', 3, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID B6D0120B-2A59-44E7-ACAF-D309B1F6F1A5 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='B6D0120B-2A59-44E7-ACAF-D309B1F6F1A5';


/* Create Entity Relationship: MJ: Roles -> MJ: Entity Form Contributions (One To Many via RoleID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '56fff3d3-8fad-40f9-be0d-d2d785c70391'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('56fff3d3-8fad-40f9-be0d-d2d785c70391', 'DA238F34-2837-EF11-86D4-6045BDEE16E6', 'CFC1ACD7-223C-423F-9777-959EC95DB70E', 'RoleID', 'One To Many', 1, 1, 17, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Entities -> MJ: Entity Form Contributions (One To Many via EntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'c4c448b4-fef4-45bc-8750-49b10f7eaa9a'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('c4c448b4-fef4-45bc-8750-49b10f7eaa9a', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'CFC1ACD7-223C-423F-9777-959EC95DB70E', 'EntityID', 'One To Many', 1, 1, 79, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Entities -> MJ: Entity Form Contributions (One To Many via RelatedEntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'bec4e9dd-5310-4286-b9be-eb4098e09199'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('bec4e9dd-5310-4286-b9be-eb4098e09199', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'CFC1ACD7-223C-423F-9777-959EC95DB70E', 'RelatedEntityID', 'One To Many', 1, 1, 80, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ: Entity Form Contributions (One To Many via UserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '74b38dfc-615c-4c6d-bbe5-c8a859fa3006'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('74b38dfc-615c-4c6d-bbe5-c8a859fa3006', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'CFC1ACD7-223C-423F-9777-959EC95DB70E', 'UserID', 'One To Many', 1, 1, 106, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Components -> MJ: Entity Form Contributions (One To Many via ComponentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'ad1313f7-0351-4f3e-a5d5-533b9233d2e5'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('ad1313f7-0351-4f3e-a5d5-533b9233d2e5', '0FB98A1D-C6AE-4427-B66C-7B31E669756F', 'CFC1ACD7-223C-423F-9777-959EC95DB70E', 'ComponentID', 'One To Many', 1, 1, 5, GETUTCDATE(), GETUTCDATE())
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

/* SQL text to update entity field related entity name field map for entity field ID A59E74DC-743B-41AE-AF37-AE846F53AA9E */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='A59E74DC-743B-41AE-AF37-AE846F53AA9E', @RelatedEntityNameFieldMap='Entity';

/* SQL text to update entity field related entity name field map for entity field ID DED4AC99-DDFC-4B49-9D80-130323D1871A */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='DED4AC99-DDFC-4B49-9D80-130323D1871A', @RelatedEntityNameFieldMap='Component';

/* SQL text to update entity field related entity name field map for entity field ID 5667D9ED-5761-4019-9D49-CAD0528DE58E */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='5667D9ED-5761-4019-9D49-CAD0528DE58E', @RelatedEntityNameFieldMap='RelatedEntity';

/* SQL text to update entity field related entity name field map for entity field ID 3BCAB356-5436-42C4-807B-ACFB454614FC */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='3BCAB356-5436-42C4-807B-ACFB454614FC', @RelatedEntityNameFieldMap='User';

/* SQL text to update entity field related entity name field map for entity field ID 6F12E3B3-2328-45CA-852F-BBE56686606F */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='6F12E3B3-2328-45CA-852F-BBE56686606F', @RelatedEntityNameFieldMap='Role';

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

/* SQL text to insert 6 new entity field(s) */
UPDATE [${flyway:defaultSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = 'CFC1ACD7-223C-423F-9777-959EC95DB70E'
         AND [Sequence] < 100000
         AND NOT EXISTS (
             SELECT 1 FROM [${flyway:defaultSchema}].[EntityField]
              WHERE [EntityID] = 'CFC1ACD7-223C-423F-9777-959EC95DB70E'
                AND [Sequence] >= 100000
         );

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '72e62ae5-6672-45bb-b55e-15b66c6797bc' OR (EntityID = 'CFC1ACD7-223C-423F-9777-959EC95DB70E' AND Name = 'Entity')) BEGIN
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
            '72e62ae5-6672-45bb-b55e-15b66c6797bc',
            'CFC1ACD7-223C-423F-9777-959EC95DB70E', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CFC1ACD7-223C-423F-9777-959EC95DB70E') + 26,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'de9f1811-a884-44ea-98b0-f5f08e3d1545' OR (EntityID = 'CFC1ACD7-223C-423F-9777-959EC95DB70E' AND Name = 'Component')) BEGIN
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
            'de9f1811-a884-44ea-98b0-f5f08e3d1545',
            'CFC1ACD7-223C-423F-9777-959EC95DB70E', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CFC1ACD7-223C-423F-9777-959EC95DB70E') + 27,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ed798b13-b7cb-4aa1-8cf1-a6c32e0ae122' OR (EntityID = 'CFC1ACD7-223C-423F-9777-959EC95DB70E' AND Name = 'RelatedEntity')) BEGIN
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
            'ed798b13-b7cb-4aa1-8cf1-a6c32e0ae122',
            'CFC1ACD7-223C-423F-9777-959EC95DB70E', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CFC1ACD7-223C-423F-9777-959EC95DB70E') + 28,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a10d498c-4b4b-4ea0-b009-580736dedaff' OR (EntityID = 'CFC1ACD7-223C-423F-9777-959EC95DB70E' AND Name = 'User')) BEGIN
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
            'a10d498c-4b4b-4ea0-b009-580736dedaff',
            'CFC1ACD7-223C-423F-9777-959EC95DB70E', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CFC1ACD7-223C-423F-9777-959EC95DB70E') + 29,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b59f4a68-24a7-4110-bf70-993b13edc48f' OR (EntityID = 'CFC1ACD7-223C-423F-9777-959EC95DB70E' AND Name = 'Role')) BEGIN
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
            'b59f4a68-24a7-4110-bf70-993b13edc48f',
            'CFC1ACD7-223C-423F-9777-959EC95DB70E', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CFC1ACD7-223C-423F-9777-959EC95DB70E') + 30,
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
               WHERE ID = '4A9B7BA6-1C72-4AE1-9C44-97377B38AA18'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B6D0120B-2A59-44E7-ACAF-D309B1F6F1A5'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '72E62AE5-6672-45BB-B55E-15B66C6797BC'
               AND AutoUpdateDefaultInView = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 0
            WHERE ID = 'CFC1ACD7-223C-423F-9777-959EC95DB70E'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set categories for 30 fields */

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '2350A80B-2304-4839-AD52-BB6CF27F18A1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.EntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Registration Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Parent Entity'
WHERE 
   ID = 'A59E74DC-743B-41AE-AF37-AE846F53AA9E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.ComponentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Component Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Component'
WHERE 
   ID = 'DED4AC99-DDFC-4B49-9D80-130323D1871A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'General Information',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '36AE0495-155A-45EF-8A6D-FA9A7B15263B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'General Information',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'B67F32FD-1813-4064-B3E9-9361F8E067EA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Slot 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Layout Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '4A9B7BA6-1C72-4AE1-9C44-97377B38AA18' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.SortKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Layout Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '39FBA246-801E-4DD4-95D0-F50ABF4B3293' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.ContributionKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Registration Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'BCAC9DF0-8EDE-440A-B84F-950B4843CA1B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.RelatedEntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Related Data Mapping',
   GeneratedFormSection = 'Category',
   DisplayName = 'Related Entity'
WHERE 
   ID = '5667D9ED-5761-4019-9D49-CAD0528DE58E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.RelatedJoinField 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Related Data Mapping',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C817AA84-DCB6-40D6-8125-494AD65435EB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.ReplacesSectionKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Layout Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'B195F0F2-C22F-430F-960D-9DA2F97E5D1D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Inclusion 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Chrome and Presentation',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'D33A262A-6A9D-4B9B-BEEA-28BBEC3A2C33' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.ChromeGroup 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Chrome and Presentation',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '0E4A74CE-B623-4B12-A30D-FFE70D8984C1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Presentation 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Chrome and Presentation',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '884F230F-D557-4C21-AE55-630018799AB9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Title 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Chrome and Presentation',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '2668D98F-879C-468D-8A54-2035EAA722FA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Icon 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Chrome and Presentation',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '67EE9E8F-B365-4ACD-AE9E-E8A021EB93EA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Scope 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Access Control',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C872DA59-9353-412B-84A1-8B87029279AD' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.UserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Access Control',
   GeneratedFormSection = 'Category',
   DisplayName = 'User'
WHERE 
   ID = '3BCAB356-5436-42C4-807B-ACFB454614FC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.RoleID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Access Control',
   GeneratedFormSection = 'Category',
   DisplayName = 'Role'
WHERE 
   ID = '6F12E3B3-2328-45CA-852F-BBE56686606F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Precedence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Registration Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C968B7C3-59F7-419D-9829-BDE75A4D16A9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Registration Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'B6D0120B-2A59-44E7-ACAF-D309B1F6F1A5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Configuration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Component Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'D2DA8A56-01AA-43C0-8853-95475C3C77D1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Notes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'General Information',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'CAE3A388-E96D-432C-A642-4A4186994688' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'BB25ED8F-6033-4AE2-BF73-2CC92A690DE9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '16217BFA-1C9D-43B1-A5A0-43A71C692748' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Entity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Registration Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity Name'
WHERE 
   ID = '72E62AE5-6672-45BB-B55E-15B66C6797BC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Component 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Component Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Component Name'
WHERE 
   ID = 'DE9F1811-A884-44EA-98B0-F5F08E3D1545' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.RelatedEntity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Related Data Mapping',
   GeneratedFormSection = 'Category',
   DisplayName = 'Related Entity Name'
WHERE 
   ID = 'ED798B13-B7CB-4AA1-8CF1-A6C32E0AE122' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.User 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Access Control',
   GeneratedFormSection = 'Category',
   DisplayName = 'User Name'
WHERE 
   ID = 'A10D498C-4B4B-4EA0-B009-580736DEDAFF' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.Role 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Access Control',
   GeneratedFormSection = 'Category',
   DisplayName = 'Role Name'
WHERE 
   ID = 'B59F4A68-24A7-4110-BF70-993B13EDC48F' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-puzzle-piece */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-puzzle-piece', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'CFC1ACD7-223C-423F-9777-959EC95DB70E';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('fd1d96a1-265e-4e55-b18d-99edf322d552', 'CFC1ACD7-223C-423F-9777-959EC95DB70E', 'FieldCategoryInfo', '{"Registration Context":{"icon":"fa fa-info-circle","description":"Core identity, precedence, and lifecycle status of the contribution."},"Component Configuration":{"icon":"fa fa-cogs","description":"Settings and JSON configuration defining the widget behavior."},"General Information":{"icon":"fa fa-align-left","description":"Descriptive metadata and authoring notes."},"Layout Configuration":{"icon":"fa fa-layer-group","description":"Placement settings for where the panel renders on the parent form."},"Related Data Mapping":{"icon":"fa fa-link","description":"Configuration for replacing or mapping to related entity grids."},"Chrome and Presentation":{"icon":"fa fa-desktop","description":"Visual styling, icons, and rail grouping settings."},"Access Control":{"icon":"fa fa-shield-alt","description":"Visibility settings for specific users or roles."},"System Metadata":{"icon":"fa fa-database","description":"Internal audit and tracking fields."}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('b4820213-7b7c-4740-882e-b53db464d58d', 'CFC1ACD7-223C-423F-9777-959EC95DB70E', 'FieldCategoryIcons', '{"Registration Context":"fa fa-info-circle","Component Configuration":"fa fa-cogs","General Information":"fa fa-align-left","Layout Configuration":"fa fa-layer-group","Related Data Mapping":"fa fa-link","Chrome and Presentation":"fa fa-desktop","Access Control":"fa fa-shield-alt","System Metadata":"fa fa-database"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'CFC1ACD7-223C-423F-9777-959EC95DB70E';
