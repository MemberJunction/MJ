-- =====================================================================================================================
-- Migration: Unified Permissions Architecture — Phase 2 (consolidated)
-- Version:   v5.30.x
-- =====================================================================================================================
-- This migration consolidates the Phase 2 unified-permissions schema changes into a single script.
-- Application-level cascade-delete semantics for Dashboard child rows are handled out-of-band by
-- setting `CascadeDeletes=true` on the `MJ: Dashboards` entity in metadata (see
-- `metadata/entities/.entity-cascade-deletes-dashboards.json`); CodeGen regenerates
-- `spDeleteDashboard` to transactionally delete child rows before the parent. We deliberately
-- do NOT use SQL `ON DELETE CASCADE` so the delete fires through `BaseEntity.Delete()` and audit /
-- engine cache invalidation runs for every child row.
--
--   1. PermissionDomain catalog table — registers each permission subsystem (provider) so the
--      unified `PermissionEngine` can load them at startup via ClassFactory.
--
--   2. EntityPermission Allow/Deny — adds `Type` column with CHECK ('Allow','Deny'). Default
--      'Allow' preserves existing behaviour; Deny rows override Allow rows on the same
--      (EntityID, RoleID, action) at evaluation time.
--
--   3. ResourcePermission.SharedByUserID — adds the column + FK to `User` so resource-permission
--      grants record their grantor (parity with DashboardPermission, CollectionPermission,
--      ArtifactPermission, AccessControlRule). Required for UI surfaces that show
--      "Shared by {user}" on records the current user didn't create.
--
--   4. UI Role permissions fix — closes gaps that were preventing UI users from sharing
--      dashboards / sending chat messages. Grants Create/Update/Delete on the four sharing
--      entities and on AI Prompt Runs + Artifact Version entities. Adds three RLS filters that
--      narrow UI reads on AIAgentRun / AIAgentRunStep / AIPromptRun to runs the user owns
--      (Developer and Integration roles are unchanged — they continue to see all runs).
--      Server-side ownership gates in the extended entity classes still enforce that a UI
--      user can only Create permissions on resources they own.
--
-- Layout below:
--   §1  PermissionDomain catalog (CREATE TABLE)
--   §2  EntityPermission.Type (ALTER TABLE)
--   §3  ResourcePermission.SharedByUserID (ALTER TABLE + FK)
--   §4  UI role permission updates + RLS filters (DML)
--   §5  Extended properties for all new columns
-- =====================================================================================================================


-- =====================================================================================================================
-- §1  PermissionDomain catalog
-- =====================================================================================================================
CREATE TABLE ${flyway:defaultSchema}.PermissionDomain (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(200) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    ProviderClassName NVARCHAR(500) NOT NULL,
    SupportedGranteeTypes NVARCHAR(200) NOT NULL,
    SupportedActions NVARCHAR(500) NOT NULL,
    SupportsDeny BIT NOT NULL DEFAULT 0,
    SupportsExpiration BIT NOT NULL DEFAULT 0,
    SupportsHierarchyInheritance BIT NOT NULL DEFAULT 0,
    IsActive BIT NOT NULL DEFAULT 1,
    DisplayOrder INT NOT NULL DEFAULT 100,
    Icon NVARCHAR(100) NULL,
    CONSTRAINT PK_PermissionDomain PRIMARY KEY (ID),
    CONSTRAINT UQ_PermissionDomain_Name UNIQUE (Name)
);
GO


-- =====================================================================================================================
-- §2  EntityPermission Allow/Deny
-- =====================================================================================================================
ALTER TABLE ${flyway:defaultSchema}.EntityPermission
ADD Type NVARCHAR(10) NOT NULL CONSTRAINT DF_EntityPermission_Type DEFAULT 'Allow'
    CONSTRAINT CK_EntityPermission_Type CHECK (Type IN ('Allow','Deny'));
GO


-- =====================================================================================================================
-- §3  ResourcePermission.SharedByUserID
-- =====================================================================================================================
ALTER TABLE [${flyway:defaultSchema}].[ResourcePermission]
    ADD [SharedByUserID] UNIQUEIDENTIFIER NULL;
GO

ALTER TABLE [${flyway:defaultSchema}].[ResourcePermission]
    ADD CONSTRAINT [FK_ResourcePermission_SharedByUserID]
    FOREIGN KEY ([SharedByUserID])
    REFERENCES [${flyway:defaultSchema}].[User]([ID]);
GO


-- =====================================================================================================================
-- §4  UI role permission updates + RLS filters
-- =====================================================================================================================
SET NOCOUNT ON;
GO

DECLARE @UIRoleID UNIQUEIDENTIFIER;
SELECT @UIRoleID = ID FROM [${flyway:defaultSchema}].[Role] WHERE [SQLName] = 'cdp_UI';

IF @UIRoleID IS NULL
BEGIN
    RAISERROR('UI role (cdp_UI) not found - cannot apply permission migration.', 16, 1);
    RETURN;
END

-- ----- 5a) Sharing entities — full CRUD; ownership is gated server-side in extended classes.

-- MJ: Dashboard Permissions — was C=0,R=1,U=0,D=0 → full CRUD
UPDATE ${flyway:defaultSchema}.EntityPermission
SET CanCreate = 1, CanUpdate = 1, CanDelete = 1
WHERE EntityID = '771ed81a-b504-4027-b223-ca3abbaa3c75'
  AND RoleID   = @UIRoleID;

-- MJ: Resource Permissions — was C=0,R=1,U=0,D=0 → full CRUD
UPDATE ${flyway:defaultSchema}.EntityPermission
SET CanCreate = 1, CanUpdate = 1, CanDelete = 1
WHERE EntityID = '201852e1-4587-ef11-8473-6045bdf077ee'
  AND RoleID   = @UIRoleID;

-- MJ: Artifact Permissions — was C=1,R=1,U=1,D=0 → add Delete
UPDATE ${flyway:defaultSchema}.EntityPermission
SET CanDelete = 1
WHERE EntityID = '19846e1a-fd8e-405f-a0fa-42a7aa44758d'
  AND RoleID   = @UIRoleID;

-- MJ: Collection Permissions — was C=1,R=1,U=1,D=0 → add Delete
UPDATE ${flyway:defaultSchema}.EntityPermission
SET CanDelete = 1
WHERE EntityID = '55e5a944-6ecd-491d-a4e9-99e1453febdb'
  AND RoleID   = @UIRoleID;

-- ----- 5b) AI Prompt Runs + artifact-version writes (gaps not covered by v5.6.x).

-- MJ: AI Prompt Runs — was C=0,R=1,U=0,D=0 → add Create + Update
UPDATE ${flyway:defaultSchema}.EntityPermission
SET CanCreate = 1, CanUpdate = 1
WHERE EntityID = '7c1c98d0-3978-4ce8-8e3f-c90301e59767'
  AND RoleID   = @UIRoleID;

-- MJ: Artifact Versions — was C=0,R=1,U=0,D=0 → add Create + Update
UPDATE ${flyway:defaultSchema}.EntityPermission
SET CanCreate = 1, CanUpdate = 1
WHERE EntityID = 'aeb408d2-162a-49ae-9dc2-dbe9a21a3c01'
  AND RoleID   = @UIRoleID;

-- MJ: Artifact Version Attributes — was C=0,R=1,U=0,D=0 → add Create + Update
UPDATE ${flyway:defaultSchema}.EntityPermission
SET CanCreate = 1, CanUpdate = 1
WHERE EntityID = '5d4bc8d7-ab3f-444e-b85a-fc89297887b2'
  AND RoleID   = @UIRoleID;

-- ----- 5c) RLS filters — UI users only see AI runs they own.

DECLARE @FilterAgentRunsID  UNIQUEIDENTIFIER = 'E1AF0001-0000-4000-B000-000000000001';
DECLARE @FilterAgentStepsID UNIQUEIDENTIFIER = 'E1AF0002-0000-4000-B000-000000000002';
DECLARE @FilterPromptRunsID UNIQUEIDENTIFIER = 'E1AF0003-0000-4000-B000-000000000003';

MERGE ${flyway:defaultSchema}.RowLevelSecurityFilter AS tgt
USING (VALUES
    (@FilterAgentRunsID, N'UI: Own AI Agent Runs',
        N'Narrows MJ: AI Agent Runs reads to runs owned by the current user. Applied to the UI role''s EntityPermission.ReadRLSFilterID.',
        N'UserID = ''{{UserID}}'''),
    (@FilterAgentStepsID, N'UI: Own AI Agent Run Steps',
        N'Narrows MJ: AI Agent Run Steps reads to steps of agent runs owned by the current user.',
        N'AgentRunID IN (SELECT ID FROM AIAgentRun WHERE UserID = ''{{UserID}}'')'),
    (@FilterPromptRunsID, N'UI: Own AI Prompt Runs',
        N'Narrows MJ: AI Prompt Runs reads to prompt runs whose parent agent run is owned by the current user. Standalone prompt runs (AgentRunID IS NULL) are not visible to UI users — they''re typically admin/system triggered.',
        N'AgentRunID IN (SELECT ID FROM AIAgentRun WHERE UserID = ''{{UserID}}'')')
) AS src (ID, Name, Description, FilterText)
ON tgt.ID = src.ID
WHEN MATCHED THEN UPDATE
    SET Name = src.Name, Description = src.Description, FilterText = src.FilterText
WHEN NOT MATCHED THEN INSERT (ID, Name, Description, FilterText)
    VALUES (src.ID, src.Name, src.Description, src.FilterText);

-- Apply each filter to the UI role's EntityPermission.ReadRLSFilterID.
UPDATE ${flyway:defaultSchema}.EntityPermission
SET ReadRLSFilterID = @FilterAgentRunsID
WHERE EntityID = '5190af93-4c39-4429-bdaa-0aeb492a0256'   -- MJ: AI Agent Runs
  AND RoleID   = @UIRoleID;

UPDATE ${flyway:defaultSchema}.EntityPermission
SET ReadRLSFilterID = @FilterAgentStepsID
WHERE EntityID = '99273dad-560e-4abc-8332-c97ab58b7463'   -- MJ: AI Agent Run Steps
  AND RoleID   = @UIRoleID;

UPDATE ${flyway:defaultSchema}.EntityPermission
SET ReadRLSFilterID = @FilterPromptRunsID
WHERE EntityID = '7c1c98d0-3978-4ce8-8e3f-c90301e59767'   -- MJ: AI Prompt Runs
  AND RoleID   = @UIRoleID;
GO


-- =====================================================================================================================
-- §5  Extended properties (descriptions for CodeGen)
-- =====================================================================================================================

-- ----- 5a) PermissionDomain table + columns

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Catalog of registered permission subsystems. Each row describes one permission provider; the PermissionEngine uses ProviderClassName as the ClassFactory key to instantiate providers at startup. Enables unified permission queries across all subsystems.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PermissionDomain';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Human-readable unique name for the permission domain (e.g., "Entity Permissions", "Dashboard Permissions"). Used in admin UI and as the domain identifier in PermissionEngine API calls.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PermissionDomain',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Detailed description of what this permission domain covers and how permissions are enforced.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PermissionDomain',
    @level2type = N'COLUMN', @level2name = N'Description';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'ClassFactory key used to instantiate this provider. Must match the key passed to @RegisterClass(PermissionProviderBase, ''ClassName''). Convention: prefix with MJ for built-in providers (e.g., MJEntityPermissionProvider).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PermissionDomain',
    @level2type = N'COLUMN', @level2name = N'ProviderClassName';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Comma-delimited list of grantee types this provider supports. Valid tokens: User, Role, Everyone, Public. Example: "User,Role".',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PermissionDomain',
    @level2type = N'COLUMN', @level2name = N'SupportedGranteeTypes';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Comma-delimited list of permission actions this provider can evaluate. Valid tokens: Read, Create, Update, Delete, Share, Execute, Admin. Example: "Read,Create,Update,Delete".',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PermissionDomain',
    @level2type = N'COLUMN', @level2name = N'SupportedActions';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When true, this provider supports explicit Deny records that override Allow grants at the same scope.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PermissionDomain',
    @level2type = N'COLUMN', @level2name = N'SupportsDeny';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When true, this provider supports time-bound permissions with an expiration timestamp.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PermissionDomain',
    @level2type = N'COLUMN', @level2name = N'SupportsExpiration';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When true, this provider resolves permissions hierarchically (e.g., category-level grants cascade to items within the category).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PermissionDomain',
    @level2type = N'COLUMN', @level2name = N'SupportsHierarchyInheritance';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When false, the PermissionEngine skips loading this provider at startup. Use to temporarily disable a provider without removing its record.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PermissionDomain',
    @level2type = N'COLUMN', @level2name = N'IsActive';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Sort order for displaying domains in the Sharing Center admin UI. Lower numbers appear first.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PermissionDomain',
    @level2type = N'COLUMN', @level2name = N'DisplayOrder';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional Font Awesome icon class for display in admin UI (e.g., "fa-solid fa-shield").',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PermissionDomain',
    @level2type = N'COLUMN', @level2name = N'Icon';

-- ----- 5b) EntityPermission.Type

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Allow or Deny. Deny rows override any Allow grants on the same (EntityID, RoleID, action) at evaluation time, letting administrators exclude a role from an action another role grants.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityPermission',
    @level2type = N'COLUMN', @level2name = N'Type';

-- ----- 5c) ResourcePermission.SharedByUserID

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The user who granted this permission. NULL when the share pre-dates this column or when the grantor is unknown (e.g., a system-seeded permission).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ResourcePermission',
    @level2type = N'COLUMN', @level2name = N'SharedByUserID';
GO
























































































/* SQL generated to create new entity MJ: Permission Domains */

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
         '34987c4c-cc16-4aa3-b5bd-687c47ed78b2',
         'MJ: Permission Domains',
         'Permission Domains',
         'Catalog of registered permission subsystems. Each row describes one permission provider; the PermissionEngine uses ProviderClassName as the ClassFactory key to instantiate providers at startup. Enables unified permission queries across all subsystems.',
         NULL,
         'PermissionDomain',
         'vwPermissionDomains',
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
      )
   

/* SQL generated to add new entity MJ: Permission Domains to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '34987c4c-cc16-4aa3-b5bd-687c47ed78b2', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Permission Domains for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('34987c4c-cc16-4aa3-b5bd-687c47ed78b2', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Permission Domains for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('34987c4c-cc16-4aa3-b5bd-687c47ed78b2', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Permission Domains for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('34987c4c-cc16-4aa3-b5bd-687c47ed78b2', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.PermissionDomain */
ALTER TABLE [${flyway:defaultSchema}].[PermissionDomain] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.PermissionDomain */
UPDATE [${flyway:defaultSchema}].[PermissionDomain] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.PermissionDomain */
ALTER TABLE [${flyway:defaultSchema}].[PermissionDomain] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.PermissionDomain */
ALTER TABLE [${flyway:defaultSchema}].[PermissionDomain] ADD CONSTRAINT [DF___mj_PermissionDomain___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt]
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.PermissionDomain */
ALTER TABLE [${flyway:defaultSchema}].[PermissionDomain] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.PermissionDomain */
UPDATE [${flyway:defaultSchema}].[PermissionDomain] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.PermissionDomain */
ALTER TABLE [${flyway:defaultSchema}].[PermissionDomain] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.PermissionDomain */
ALTER TABLE [${flyway:defaultSchema}].[PermissionDomain] ADD CONSTRAINT [DF___mj_PermissionDomain___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt]
GO

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '42b9846c-7a43-4763-9d03-ea12a75fe9f3' OR (EntityID = 'EA238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Type')) BEGIN
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
            '42b9846c-7a43-4763-9d03-ea12a75fe9f3',
            'EA238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Entity Permissions
            100035,
            'Type',
            'Type',
            'Allow or Deny. Deny rows override any Allow grants on the same (EntityID, RoleID, action) at evaluation time, letting administrators exclude a role from an action another role grants.',
            'nvarchar',
            20,
            0,
            0,
            0,
            'Allow',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ccb04617-55a8-4caa-964d-c1f38d400aac' OR (EntityID = '201852E1-4587-EF11-8473-6045BDF077EE' AND Name = 'SharedByUserID')) BEGIN
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
            'ccb04617-55a8-4caa-964d-c1f38d400aac',
            '201852E1-4587-EF11-8473-6045BDF077EE', -- Entity: MJ: Resource Permissions
            100029,
            'SharedByUserID',
            'Shared By User ID',
            'The user who granted this permission. NULL when the share pre-dates this column or when the grantor is unknown (e.g., a system-seeded permission).',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b3c3a5c3-41e4-4b6e-a233-79cc169b8d93' OR (EntityID = '34987C4C-CC16-4AA3-B5BD-687C47ED78B2' AND Name = 'ID')) BEGIN
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
            'b3c3a5c3-41e4-4b6e-a233-79cc169b8d93',
            '34987C4C-CC16-4AA3-B5BD-687C47ED78B2', -- Entity: MJ: Permission Domains
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a4089c3e-2a33-48f5-a833-570d0a3a6344' OR (EntityID = '34987C4C-CC16-4AA3-B5BD-687C47ED78B2' AND Name = 'Name')) BEGIN
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
            'a4089c3e-2a33-48f5-a833-570d0a3a6344',
            '34987C4C-CC16-4AA3-B5BD-687C47ED78B2', -- Entity: MJ: Permission Domains
            100002,
            'Name',
            'Name',
            'Human-readable unique name for the permission domain (e.g., "Entity Permissions", "Dashboard Permissions"). Used in admin UI and as the domain identifier in PermissionEngine API calls.',
            'nvarchar',
            400,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a8276d2c-552f-41f9-a262-ac32a92f652c' OR (EntityID = '34987C4C-CC16-4AA3-B5BD-687C47ED78B2' AND Name = 'Description')) BEGIN
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
            'a8276d2c-552f-41f9-a262-ac32a92f652c',
            '34987C4C-CC16-4AA3-B5BD-687C47ED78B2', -- Entity: MJ: Permission Domains
            100003,
            'Description',
            'Description',
            'Detailed description of what this permission domain covers and how permissions are enforced.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '83b92d39-cc5d-42bc-8732-1eb84c81ca93' OR (EntityID = '34987C4C-CC16-4AA3-B5BD-687C47ED78B2' AND Name = 'ProviderClassName')) BEGIN
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
            '83b92d39-cc5d-42bc-8732-1eb84c81ca93',
            '34987C4C-CC16-4AA3-B5BD-687C47ED78B2', -- Entity: MJ: Permission Domains
            100004,
            'ProviderClassName',
            'Provider Class Name',
            'ClassFactory key used to instantiate this provider. Must match the key passed to @RegisterClass(PermissionProviderBase, ''ClassName''). Convention: prefix with MJ for built-in providers (e.g., MJEntityPermissionProvider).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b18b58c5-bce3-4a59-8db7-b601b718a922' OR (EntityID = '34987C4C-CC16-4AA3-B5BD-687C47ED78B2' AND Name = 'SupportedGranteeTypes')) BEGIN
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
            'b18b58c5-bce3-4a59-8db7-b601b718a922',
            '34987C4C-CC16-4AA3-B5BD-687C47ED78B2', -- Entity: MJ: Permission Domains
            100005,
            'SupportedGranteeTypes',
            'Supported Grantee Types',
            'Comma-delimited list of grantee types this provider supports. Valid tokens: User, Role, Everyone, Public. Example: "User,Role".',
            'nvarchar',
            400,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '271f5672-9e32-4f4c-bfde-a61dfd346801' OR (EntityID = '34987C4C-CC16-4AA3-B5BD-687C47ED78B2' AND Name = 'SupportedActions')) BEGIN
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
            '271f5672-9e32-4f4c-bfde-a61dfd346801',
            '34987C4C-CC16-4AA3-B5BD-687C47ED78B2', -- Entity: MJ: Permission Domains
            100006,
            'SupportedActions',
            'Supported Actions',
            'Comma-delimited list of permission actions this provider can evaluate. Valid tokens: Read, Create, Update, Delete, Share, Execute, Admin. Example: "Read,Create,Update,Delete".',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '13af21be-95f9-4dbf-b0e6-d6f3ea98f0fb' OR (EntityID = '34987C4C-CC16-4AA3-B5BD-687C47ED78B2' AND Name = 'SupportsDeny')) BEGIN
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
            '13af21be-95f9-4dbf-b0e6-d6f3ea98f0fb',
            '34987C4C-CC16-4AA3-B5BD-687C47ED78B2', -- Entity: MJ: Permission Domains
            100007,
            'SupportsDeny',
            'Supports Deny',
            'When true, this provider supports explicit Deny records that override Allow grants at the same scope.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bfac0067-e99c-4493-9d61-d871fd49d6b1' OR (EntityID = '34987C4C-CC16-4AA3-B5BD-687C47ED78B2' AND Name = 'SupportsExpiration')) BEGIN
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
            'bfac0067-e99c-4493-9d61-d871fd49d6b1',
            '34987C4C-CC16-4AA3-B5BD-687C47ED78B2', -- Entity: MJ: Permission Domains
            100008,
            'SupportsExpiration',
            'Supports Expiration',
            'When true, this provider supports time-bound permissions with an expiration timestamp.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '17dc3403-73ec-4baa-8774-bd2c4655accb' OR (EntityID = '34987C4C-CC16-4AA3-B5BD-687C47ED78B2' AND Name = 'SupportsHierarchyInheritance')) BEGIN
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
            '17dc3403-73ec-4baa-8774-bd2c4655accb',
            '34987C4C-CC16-4AA3-B5BD-687C47ED78B2', -- Entity: MJ: Permission Domains
            100009,
            'SupportsHierarchyInheritance',
            'Supports Hierarchy Inheritance',
            'When true, this provider resolves permissions hierarchically (e.g., category-level grants cascade to items within the category).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a7192e15-b12f-4680-a8a6-bbce14e21b8f' OR (EntityID = '34987C4C-CC16-4AA3-B5BD-687C47ED78B2' AND Name = 'IsActive')) BEGIN
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
            'a7192e15-b12f-4680-a8a6-bbce14e21b8f',
            '34987C4C-CC16-4AA3-B5BD-687C47ED78B2', -- Entity: MJ: Permission Domains
            100010,
            'IsActive',
            'Is Active',
            'When false, the PermissionEngine skips loading this provider at startup. Use to temporarily disable a provider without removing its record.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '31bdc7c8-1ad1-4f28-b4d6-c0559cc51e37' OR (EntityID = '34987C4C-CC16-4AA3-B5BD-687C47ED78B2' AND Name = 'DisplayOrder')) BEGIN
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
            '31bdc7c8-1ad1-4f28-b4d6-c0559cc51e37',
            '34987C4C-CC16-4AA3-B5BD-687C47ED78B2', -- Entity: MJ: Permission Domains
            100011,
            'DisplayOrder',
            'Display Order',
            'Sort order for displaying domains in the Sharing Center admin UI. Lower numbers appear first.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2872fcd7-ac3e-47af-94f3-85d3dc998760' OR (EntityID = '34987C4C-CC16-4AA3-B5BD-687C47ED78B2' AND Name = 'Icon')) BEGIN
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
            '2872fcd7-ac3e-47af-94f3-85d3dc998760',
            '34987C4C-CC16-4AA3-B5BD-687C47ED78B2', -- Entity: MJ: Permission Domains
            100012,
            'Icon',
            'Icon',
            'Optional Font Awesome icon class for display in admin UI (e.g., "fa-solid fa-shield").',
            'nvarchar',
            200,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3b07af73-44ca-4611-aa96-c8c47e025b3d' OR (EntityID = '34987C4C-CC16-4AA3-B5BD-687C47ED78B2' AND Name = '__mj_CreatedAt')) BEGIN
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
            '3b07af73-44ca-4611-aa96-c8c47e025b3d',
            '34987C4C-CC16-4AA3-B5BD-687C47ED78B2', -- Entity: MJ: Permission Domains
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4dfb201e-c019-42f5-8cb9-0ab80e08f2eb' OR (EntityID = '34987C4C-CC16-4AA3-B5BD-687C47ED78B2' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '4dfb201e-c019-42f5-8cb9-0ab80e08f2eb',
            '34987C4C-CC16-4AA3-B5BD-687C47ED78B2', -- Entity: MJ: Permission Domains
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

/* SQL text to insert entity field value with ID b2175e01-0256-4652-9af4-87189ccb9425 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b2175e01-0256-4652-9af4-87189ccb9425', '42B9846C-7A43-4763-9D03-EA12A75FE9F3', 1, 'Allow', 'Allow', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID ecb471a0-e219-4386-9bfe-950ed7c79aab */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ecb471a0-e219-4386-9bfe-950ed7c79aab', '42B9846C-7A43-4763-9D03-EA12A75FE9F3', 2, 'Deny', 'Deny', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID 42B9846C-7A43-4763-9D03-EA12A75FE9F3 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='42B9846C-7A43-4763-9D03-EA12A75FE9F3'


/* Create Entity Relationship: MJ: Users -> MJ: Resource Permissions (One To Many via SharedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'b9276fc4-135c-4e5a-8143-23d40ba300bf'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('b9276fc4-135c-4e5a-8143-23d40ba300bf', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '201852E1-4587-EF11-8473-6045BDF077EE', 'SharedByUserID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    

/* SQL text to update entity field related entity name field map for entity field ID 0C1AE9BD-D895-4ECF-B65B-43EA80D9949C */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='0C1AE9BD-D895-4ECF-B65B-43EA80D9949C', @RelatedEntityNameFieldMap='ArchiveRun'

/* Base View SQL for MJ: Archive Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Run Details
-- Item: vwArchiveRunDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Archive Run Details
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ArchiveRunDetail
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwArchiveRunDetails]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwArchiveRunDetails];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwArchiveRunDetails]
AS
SELECT
    a.*,
    MJArchiveRun_ArchiveRunID.[StartedAt] AS [ArchiveRun],
    MJEntity_EntityID.[Name] AS [Entity]
FROM
    [${flyway:defaultSchema}].[ArchiveRunDetail] AS a
INNER JOIN
    [${flyway:defaultSchema}].[ArchiveRun] AS MJArchiveRun_ArchiveRunID
  ON
    [a].[ArchiveRunID] = MJArchiveRun_ArchiveRunID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_EntityID
  ON
    [a].[EntityID] = MJEntity_EntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwArchiveRunDetails] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Archive Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Run Details
-- Item: Permissions for vwArchiveRunDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwArchiveRunDetails] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Archive Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Run Details
-- Item: spCreateArchiveRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ArchiveRunDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateArchiveRunDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateArchiveRunDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateArchiveRunDetail]
    @ID uniqueidentifier = NULL,
    @ArchiveRunID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(750),
    @Status nvarchar(50),
    @StoragePath nvarchar(1000),
    @BytesArchived bigint = NULL,
    @ErrorMessage nvarchar(MAX),
    @ArchivedAt datetimeoffset,
    @VersionStamp datetimeoffset,
    @IsRecordChangeArchive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ArchiveRunDetail]
            (
                [ID],
                [ArchiveRunID],
                [EntityID],
                [RecordID],
                [Status],
                [StoragePath],
                [BytesArchived],
                [ErrorMessage],
                [ArchivedAt],
                [VersionStamp],
                [IsRecordChangeArchive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ArchiveRunID,
                @EntityID,
                @RecordID,
                @Status,
                @StoragePath,
                ISNULL(@BytesArchived, 0),
                @ErrorMessage,
                @ArchivedAt,
                @VersionStamp,
                ISNULL(@IsRecordChangeArchive, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ArchiveRunDetail]
            (
                [ArchiveRunID],
                [EntityID],
                [RecordID],
                [Status],
                [StoragePath],
                [BytesArchived],
                [ErrorMessage],
                [ArchivedAt],
                [VersionStamp],
                [IsRecordChangeArchive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ArchiveRunID,
                @EntityID,
                @RecordID,
                @Status,
                @StoragePath,
                ISNULL(@BytesArchived, 0),
                @ErrorMessage,
                @ArchivedAt,
                @VersionStamp,
                ISNULL(@IsRecordChangeArchive, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwArchiveRunDetails] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArchiveRunDetail] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Archive Run Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArchiveRunDetail] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Archive Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Run Details
-- Item: spUpdateArchiveRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ArchiveRunDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateArchiveRunDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateArchiveRunDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateArchiveRunDetail]
    @ID uniqueidentifier,
    @ArchiveRunID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(750),
    @Status nvarchar(50),
    @StoragePath nvarchar(1000),
    @BytesArchived bigint,
    @ErrorMessage nvarchar(MAX),
    @ArchivedAt datetimeoffset,
    @VersionStamp datetimeoffset,
    @IsRecordChangeArchive bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ArchiveRunDetail]
    SET
        [ArchiveRunID] = @ArchiveRunID,
        [EntityID] = @EntityID,
        [RecordID] = @RecordID,
        [Status] = @Status,
        [StoragePath] = @StoragePath,
        [BytesArchived] = @BytesArchived,
        [ErrorMessage] = @ErrorMessage,
        [ArchivedAt] = @ArchivedAt,
        [VersionStamp] = @VersionStamp,
        [IsRecordChangeArchive] = @IsRecordChangeArchive
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwArchiveRunDetails] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwArchiveRunDetails]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArchiveRunDetail] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ArchiveRunDetail table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateArchiveRunDetail]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateArchiveRunDetail];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateArchiveRunDetail
ON [${flyway:defaultSchema}].[ArchiveRunDetail]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ArchiveRunDetail]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ArchiveRunDetail] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Archive Run Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArchiveRunDetail] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Archive Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Run Details
-- Item: spDeleteArchiveRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ArchiveRunDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteArchiveRunDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteArchiveRunDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteArchiveRunDetail]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ArchiveRunDetail]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArchiveRunDetail] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Archive Run Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArchiveRunDetail] TO [cdp_Integration]



/* Index for Foreign Keys for EntityPermission */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Permissions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table EntityPermission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityPermission_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityPermission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityPermission_EntityID ON [${flyway:defaultSchema}].[EntityPermission] ([EntityID]);

-- Index for foreign key RoleID in table EntityPermission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityPermission_RoleID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityPermission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityPermission_RoleID ON [${flyway:defaultSchema}].[EntityPermission] ([RoleID]);

-- Index for foreign key ReadRLSFilterID in table EntityPermission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityPermission_ReadRLSFilterID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityPermission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityPermission_ReadRLSFilterID ON [${flyway:defaultSchema}].[EntityPermission] ([ReadRLSFilterID]);

-- Index for foreign key CreateRLSFilterID in table EntityPermission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityPermission_CreateRLSFilterID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityPermission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityPermission_CreateRLSFilterID ON [${flyway:defaultSchema}].[EntityPermission] ([CreateRLSFilterID]);

-- Index for foreign key UpdateRLSFilterID in table EntityPermission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityPermission_UpdateRLSFilterID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityPermission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityPermission_UpdateRLSFilterID ON [${flyway:defaultSchema}].[EntityPermission] ([UpdateRLSFilterID]);

-- Index for foreign key DeleteRLSFilterID in table EntityPermission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityPermission_DeleteRLSFilterID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityPermission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityPermission_DeleteRLSFilterID ON [${flyway:defaultSchema}].[EntityPermission] ([DeleteRLSFilterID]);

/* Base View Permissions SQL for MJ: Entity Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Permissions
-- Item: Permissions for vwEntityPermissions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityPermissions] TO [cdp_Developer], [cdp_UI], [cdp_Integration]

/* spCreate SQL for MJ: Entity Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Permissions
-- Item: spCreateEntityPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityPermission
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntityPermission]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntityPermission];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityPermission]
    @ID uniqueidentifier = NULL,
    @EntityID uniqueidentifier,
    @RoleID uniqueidentifier,
    @CanCreate bit = NULL,
    @CanRead bit = NULL,
    @CanUpdate bit = NULL,
    @CanDelete bit = NULL,
    @ReadRLSFilterID uniqueidentifier,
    @CreateRLSFilterID uniqueidentifier,
    @UpdateRLSFilterID uniqueidentifier,
    @DeleteRLSFilterID uniqueidentifier,
    @Type nvarchar(10) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
            (
                [ID],
                [EntityID],
                [RoleID],
                [CanCreate],
                [CanRead],
                [CanUpdate],
                [CanDelete],
                [ReadRLSFilterID],
                [CreateRLSFilterID],
                [UpdateRLSFilterID],
                [DeleteRLSFilterID],
                [Type]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityID,
                @RoleID,
                ISNULL(@CanCreate, 0),
                ISNULL(@CanRead, 0),
                ISNULL(@CanUpdate, 0),
                ISNULL(@CanDelete, 0),
                @ReadRLSFilterID,
                @CreateRLSFilterID,
                @UpdateRLSFilterID,
                @DeleteRLSFilterID,
                ISNULL(@Type, 'Allow')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
            (
                [EntityID],
                [RoleID],
                [CanCreate],
                [CanRead],
                [CanUpdate],
                [CanDelete],
                [ReadRLSFilterID],
                [CreateRLSFilterID],
                [UpdateRLSFilterID],
                [DeleteRLSFilterID],
                [Type]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityID,
                @RoleID,
                ISNULL(@CanCreate, 0),
                ISNULL(@CanRead, 0),
                ISNULL(@CanUpdate, 0),
                ISNULL(@CanDelete, 0),
                @ReadRLSFilterID,
                @CreateRLSFilterID,
                @UpdateRLSFilterID,
                @DeleteRLSFilterID,
                ISNULL(@Type, 'Allow')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityPermissions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityPermission] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Entity Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityPermission] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Entity Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Permissions
-- Item: spUpdateEntityPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityPermission
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntityPermission]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityPermission];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityPermission]
    @ID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RoleID uniqueidentifier,
    @CanCreate bit,
    @CanRead bit,
    @CanUpdate bit,
    @CanDelete bit,
    @ReadRLSFilterID uniqueidentifier,
    @CreateRLSFilterID uniqueidentifier,
    @UpdateRLSFilterID uniqueidentifier,
    @DeleteRLSFilterID uniqueidentifier,
    @Type nvarchar(10)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityPermission]
    SET
        [EntityID] = @EntityID,
        [RoleID] = @RoleID,
        [CanCreate] = @CanCreate,
        [CanRead] = @CanRead,
        [CanUpdate] = @CanUpdate,
        [CanDelete] = @CanDelete,
        [ReadRLSFilterID] = @ReadRLSFilterID,
        [CreateRLSFilterID] = @CreateRLSFilterID,
        [UpdateRLSFilterID] = @UpdateRLSFilterID,
        [DeleteRLSFilterID] = @DeleteRLSFilterID,
        [Type] = @Type
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntityPermissions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityPermissions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityPermission] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityPermission table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntityPermission]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntityPermission];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityPermission
ON [${flyway:defaultSchema}].[EntityPermission]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityPermission]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityPermission] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Entity Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityPermission] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Entity Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Permissions
-- Item: spDeleteEntityPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityPermission
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntityPermission]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityPermission];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityPermission]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntityPermission]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityPermission] TO [cdp_Developer], [cdp_Integration]
    

/* spDelete Permissions for MJ: Entity Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityPermission] TO [cdp_Developer], [cdp_Integration]



/* Index for Foreign Keys for PermissionDomain */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Permission Domains
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for MJ: Permission Domains */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Permission Domains
-- Item: vwPermissionDomains
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Permission Domains
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  PermissionDomain
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwPermissionDomains]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwPermissionDomains];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwPermissionDomains]
AS
SELECT
    p.*
FROM
    [${flyway:defaultSchema}].[PermissionDomain] AS p
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwPermissionDomains] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Permission Domains */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Permission Domains
-- Item: Permissions for vwPermissionDomains
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwPermissionDomains] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Permission Domains */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Permission Domains
-- Item: spCreatePermissionDomain
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR PermissionDomain
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreatePermissionDomain]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreatePermissionDomain];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreatePermissionDomain]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(200),
    @Description nvarchar(MAX),
    @ProviderClassName nvarchar(500),
    @SupportedGranteeTypes nvarchar(200),
    @SupportedActions nvarchar(500),
    @SupportsDeny bit = NULL,
    @SupportsExpiration bit = NULL,
    @SupportsHierarchyInheritance bit = NULL,
    @IsActive bit = NULL,
    @DisplayOrder int = NULL,
    @Icon nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[PermissionDomain]
            (
                [ID],
                [Name],
                [Description],
                [ProviderClassName],
                [SupportedGranteeTypes],
                [SupportedActions],
                [SupportsDeny],
                [SupportsExpiration],
                [SupportsHierarchyInheritance],
                [IsActive],
                [DisplayOrder],
                [Icon]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @ProviderClassName,
                @SupportedGranteeTypes,
                @SupportedActions,
                ISNULL(@SupportsDeny, 0),
                ISNULL(@SupportsExpiration, 0),
                ISNULL(@SupportsHierarchyInheritance, 0),
                ISNULL(@IsActive, 1),
                ISNULL(@DisplayOrder, 100),
                @Icon
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[PermissionDomain]
            (
                [Name],
                [Description],
                [ProviderClassName],
                [SupportedGranteeTypes],
                [SupportedActions],
                [SupportsDeny],
                [SupportsExpiration],
                [SupportsHierarchyInheritance],
                [IsActive],
                [DisplayOrder],
                [Icon]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @ProviderClassName,
                @SupportedGranteeTypes,
                @SupportedActions,
                ISNULL(@SupportsDeny, 0),
                ISNULL(@SupportsExpiration, 0),
                ISNULL(@SupportsHierarchyInheritance, 0),
                ISNULL(@IsActive, 1),
                ISNULL(@DisplayOrder, 100),
                @Icon
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwPermissionDomains] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreatePermissionDomain] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Permission Domains */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreatePermissionDomain] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Permission Domains */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Permission Domains
-- Item: spUpdatePermissionDomain
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PermissionDomain
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdatePermissionDomain]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdatePermissionDomain];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdatePermissionDomain]
    @ID uniqueidentifier,
    @Name nvarchar(200),
    @Description nvarchar(MAX),
    @ProviderClassName nvarchar(500),
    @SupportedGranteeTypes nvarchar(200),
    @SupportedActions nvarchar(500),
    @SupportsDeny bit,
    @SupportsExpiration bit,
    @SupportsHierarchyInheritance bit,
    @IsActive bit,
    @DisplayOrder int,
    @Icon nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PermissionDomain]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [ProviderClassName] = @ProviderClassName,
        [SupportedGranteeTypes] = @SupportedGranteeTypes,
        [SupportedActions] = @SupportedActions,
        [SupportsDeny] = @SupportsDeny,
        [SupportsExpiration] = @SupportsExpiration,
        [SupportsHierarchyInheritance] = @SupportsHierarchyInheritance,
        [IsActive] = @IsActive,
        [DisplayOrder] = @DisplayOrder,
        [Icon] = @Icon
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwPermissionDomains] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwPermissionDomains]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePermissionDomain] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the PermissionDomain table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdatePermissionDomain]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdatePermissionDomain];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdatePermissionDomain
ON [${flyway:defaultSchema}].[PermissionDomain]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PermissionDomain]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[PermissionDomain] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Permission Domains */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePermissionDomain] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Permission Domains */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Permission Domains
-- Item: spDeletePermissionDomain
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR PermissionDomain
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeletePermissionDomain]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeletePermissionDomain];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeletePermissionDomain]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[PermissionDomain]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeletePermissionDomain] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Permission Domains */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeletePermissionDomain] TO [cdp_Integration]



/* Index for Foreign Keys for ResourcePermission */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Resource Permissions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ResourceTypeID in table ResourcePermission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ResourcePermission_ResourceTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ResourcePermission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ResourcePermission_ResourceTypeID ON [${flyway:defaultSchema}].[ResourcePermission] ([ResourceTypeID]);

-- Index for foreign key RoleID in table ResourcePermission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ResourcePermission_RoleID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ResourcePermission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ResourcePermission_RoleID ON [${flyway:defaultSchema}].[ResourcePermission] ([RoleID]);

-- Index for foreign key UserID in table ResourcePermission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ResourcePermission_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ResourcePermission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ResourcePermission_UserID ON [${flyway:defaultSchema}].[ResourcePermission] ([UserID]);

-- Index for foreign key SharedByUserID in table ResourcePermission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ResourcePermission_SharedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ResourcePermission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ResourcePermission_SharedByUserID ON [${flyway:defaultSchema}].[ResourcePermission] ([SharedByUserID]);

/* SQL text to update entity field related entity name field map for entity field ID CCB04617-55A8-4CAA-964D-C1F38D400AAC */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='CCB04617-55A8-4CAA-964D-C1F38D400AAC', @RelatedEntityNameFieldMap='SharedByUser'

/* Base View SQL for MJ: Resource Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Resource Permissions
-- Item: vwResourcePermissions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Resource Permissions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ResourcePermission
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwResourcePermissions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwResourcePermissions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwResourcePermissions]
AS
SELECT
    r.*,
    MJResourceType_ResourceTypeID.[Name] AS [ResourceType],
    MJRole_RoleID.[Name] AS [Role],
    MJUser_UserID.[Name] AS [User],
    MJUser_SharedByUserID.[Name] AS [SharedByUser]
FROM
    [${flyway:defaultSchema}].[ResourcePermission] AS r
INNER JOIN
    [${flyway:defaultSchema}].[ResourceType] AS MJResourceType_ResourceTypeID
  ON
    [r].[ResourceTypeID] = MJResourceType_ResourceTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Role] AS MJRole_RoleID
  ON
    [r].[RoleID] = MJRole_RoleID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [r].[UserID] = MJUser_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_SharedByUserID
  ON
    [r].[SharedByUserID] = MJUser_SharedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwResourcePermissions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Resource Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Resource Permissions
-- Item: Permissions for vwResourcePermissions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwResourcePermissions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Resource Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Resource Permissions
-- Item: spCreateResourcePermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ResourcePermission
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateResourcePermission]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateResourcePermission];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateResourcePermission]
    @ID uniqueidentifier = NULL,
    @ResourceTypeID uniqueidentifier,
    @ResourceRecordID nvarchar(255),
    @Type nvarchar(10),
    @StartSharingAt datetimeoffset,
    @EndSharingAt datetimeoffset,
    @RoleID uniqueidentifier,
    @UserID uniqueidentifier,
    @PermissionLevel nvarchar(20),
    @Status nvarchar(20) = NULL,
    @SharedByUserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ResourcePermission]
            (
                [ID],
                [ResourceTypeID],
                [ResourceRecordID],
                [Type],
                [StartSharingAt],
                [EndSharingAt],
                [RoleID],
                [UserID],
                [PermissionLevel],
                [Status],
                [SharedByUserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ResourceTypeID,
                @ResourceRecordID,
                @Type,
                @StartSharingAt,
                @EndSharingAt,
                @RoleID,
                @UserID,
                @PermissionLevel,
                ISNULL(@Status, 'Requested'),
                @SharedByUserID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ResourcePermission]
            (
                [ResourceTypeID],
                [ResourceRecordID],
                [Type],
                [StartSharingAt],
                [EndSharingAt],
                [RoleID],
                [UserID],
                [PermissionLevel],
                [Status],
                [SharedByUserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ResourceTypeID,
                @ResourceRecordID,
                @Type,
                @StartSharingAt,
                @EndSharingAt,
                @RoleID,
                @UserID,
                @PermissionLevel,
                ISNULL(@Status, 'Requested'),
                @SharedByUserID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwResourcePermissions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateResourcePermission] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Resource Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateResourcePermission] TO [cdp_UI], [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Resource Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Resource Permissions
-- Item: spUpdateResourcePermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ResourcePermission
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateResourcePermission]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateResourcePermission];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateResourcePermission]
    @ID uniqueidentifier,
    @ResourceTypeID uniqueidentifier,
    @ResourceRecordID nvarchar(255),
    @Type nvarchar(10),
    @StartSharingAt datetimeoffset,
    @EndSharingAt datetimeoffset,
    @RoleID uniqueidentifier,
    @UserID uniqueidentifier,
    @PermissionLevel nvarchar(20),
    @Status nvarchar(20),
    @SharedByUserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ResourcePermission]
    SET
        [ResourceTypeID] = @ResourceTypeID,
        [ResourceRecordID] = @ResourceRecordID,
        [Type] = @Type,
        [StartSharingAt] = @StartSharingAt,
        [EndSharingAt] = @EndSharingAt,
        [RoleID] = @RoleID,
        [UserID] = @UserID,
        [PermissionLevel] = @PermissionLevel,
        [Status] = @Status,
        [SharedByUserID] = @SharedByUserID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwResourcePermissions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwResourcePermissions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateResourcePermission] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ResourcePermission table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateResourcePermission]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateResourcePermission];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateResourcePermission
ON [${flyway:defaultSchema}].[ResourcePermission]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ResourcePermission]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ResourcePermission] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Resource Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateResourcePermission] TO [cdp_UI], [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Resource Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Resource Permissions
-- Item: spDeleteResourcePermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ResourcePermission
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteResourcePermission]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteResourcePermission];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteResourcePermission]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ResourcePermission]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteResourcePermission] TO [cdp_UI], [cdp_Integration]
    

/* spDelete Permissions for MJ: Resource Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteResourcePermission] TO [cdp_UI], [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '03ada0e1-afd7-425c-a79b-7e032bb210b9' OR (EntityID = '201852E1-4587-EF11-8473-6045BDF077EE' AND Name = 'SharedByUser')) BEGIN
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
            '03ada0e1-afd7-425c-a79b-7e032bb210b9',
            '201852E1-4587-EF11-8473-6045BDF077EE', -- Entity: MJ: Resource Permissions
            100033,
            'SharedByUser',
            'Shared By User',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3a9425c5-bb17-4f0c-8e81-08dbdaca9fda' OR (EntityID = 'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6' AND Name = 'ArchiveRun')) BEGIN
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
            '3a9425c5-bb17-4f0c-8e81-08dbdaca9fda',
            'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6', -- Entity: MJ: Archive Run Details
            100028,
            'ArchiveRun',
            'Archive Run',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
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
               WHERE ID = '83B92D39-CC5D-42BC-8732-1EB84C81CA93'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A7192E15-B12F-4680-A8A6-BBCE14E21B8F'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '31BDC7C8-1AD1-4F28-B4D6-C0559CC51E37'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '83B92D39-CC5D-42BC-8732-1EB84C81CA93'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'A4089C3E-2A33-48F5-A833-570D0A3A6344'
               AND AutoUpdateUserSearchPredicate = 1
            

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = 'C65717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '42B9846C-7A43-4763-9D03-EA12A75FE9F3'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'C65717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '1029550C-6E47-EF11-86C3-00224821D189'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'C65717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateUserSearchPredicate = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '1029550C-6E47-EF11-86C3-00224821D189'
               AND AutoUpdateUserSearchPredicate = 1
            

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 1
            WHERE ID = 'EA238F34-2837-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateAllowUserSearchAPI = 1
         

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '99EB5364-1B2B-430B-BC94-709C6D26AA08'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = 'EA65A64E-9935-4702-AEDD-A2A4BDC1BCD2'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'AAB9433E-F36B-1410-867F-007B559E242F'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E3344718-4687-EF11-8473-6045BDF077EE'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3922FE34-E68A-EF11-8473-6045BDF077EE'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '99EB5364-1B2B-430B-BC94-709C6D26AA08'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'EA65A64E-9935-4702-AEDD-A2A4BDC1BCD2'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '1A164F09-D65D-4B1F-B954-F1A2201427F0'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '99EB5364-1B2B-430B-BC94-709C6D26AA08'
               AND AutoUpdateUserSearchPredicate = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '1A164F09-D65D-4B1F-B954-F1A2201427F0'
               AND AutoUpdateUserSearchPredicate = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'EA65A64E-9935-4702-AEDD-A2A4BDC1BCD2'
               AND AutoUpdateUserSearchPredicate = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = 'E3344718-4687-EF11-8473-6045BDF077EE'
               AND AutoUpdateUserSearchPredicate = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '3922FE34-E68A-EF11-8473-6045BDF077EE'
               AND AutoUpdateUserSearchPredicate = 1
            

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 1
            WHERE ID = '201852E1-4587-EF11-8473-6045BDF077EE'
            AND AutoUpdateAllowUserSearchAPI = 1
         

/* Set categories for 15 fields */

-- UPDATE Entity Field Category Info MJ: Archive Run Details.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '79525349-F1A7-45CD-BDDB-15D45E1EA4D5' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B90E24FD-D3A9-4D00-A94B-17E2B1FB2FE3' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EB7FEB68-C246-4B48-9518-B8BCF5793611' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.ArchiveRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0C1AE9BD-D895-4ECF-B65B-43EA80D9949C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.EntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6170C43C-462B-42B1-972B-1D8B7789682B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.RecordID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2CD99CC3-14AC-466E-B9D1-CE5E050B58AA' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.Entity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0A500C87-F127-4776-8EEF-7ECA8E7A414C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B67B2260-8850-40F9-8902-5D91D0159FE7' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.StoragePath 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2A48A363-DC62-4DD2-833B-EB7CFBABB283' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.BytesArchived 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5B53CD8F-01E4-41C3-A6E3-313A83103ECF' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.ErrorMessage 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0823FBF5-191B-4799-A64E-778C6AF033A1' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.ArchivedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BFCCF263-AF8A-405C-B57D-473AAC8A9E90' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.VersionStamp 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '07F192B4-3A6D-4FEB-869B-6ED067BB82F0' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.IsRecordChangeArchive 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Is Record Change',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4959B7F3-AD32-40DD-8E3F-8DF97E4C6844' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Archive Run Details.ArchiveRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Timeline and Versioning',
   GeneratedFormSection = 'Category',
   DisplayName = 'Archive Run Timestamp',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3A9425C5-BB17-4F0C-8E81-08DBDACA9FDA' AND AutoUpdateCategory = 1

/* Set categories for 14 fields */

-- UPDATE Entity Field Category Info MJ: Permission Domains.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B3C3A5C3-41E4-4B6E-A233-79CC169B8D93' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Permission Domains.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Domain Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A4089C3E-2A33-48F5-A833-570D0A3A6344' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Permission Domains.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Domain Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A8276D2C-552F-41F9-A262-AC32A92F652C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Permission Domains.ProviderClassName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Provider Implementation',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '83B92D39-CC5D-42BC-8732-1EB84C81CA93' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Permission Domains.SupportedGranteeTypes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Provider Capabilities',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B18B58C5-BCE3-4A59-8DB7-B601B718A922' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Permission Domains.SupportedActions 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Provider Capabilities',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '271F5672-9E32-4F4C-BFDE-A61DFD346801' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Permission Domains.SupportsDeny 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Provider Capabilities',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '13AF21BE-95F9-4DBF-B0E6-D6F3EA98F0FB' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Permission Domains.SupportsExpiration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Provider Capabilities',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BFAC0067-E99C-4493-9D61-D871FD49D6B1' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Permission Domains.SupportsHierarchyInheritance 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Provider Capabilities',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '17DC3403-73EC-4BAA-8774-BD2C4655ACCB' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Permission Domains.IsActive 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Domain Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A7192E15-B12F-4680-A8A6-BBCE14E21B8F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Permission Domains.DisplayOrder 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Domain Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '31BDC7C8-1AD1-4F28-B4D6-C0559CC51E37' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Permission Domains.Icon 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Domain Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2872FCD7-AC3E-47AF-94F3-85D3DC998760' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Permission Domains.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3B07AF73-44CA-4611-AA96-C8C47E025B3D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Permission Domains.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4DFB201E-C019-42F5-8CB9-0AB80E08F2EB' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-shield-alt */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-shield-alt', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = '34987C4C-CC16-4AA3-B5BD-687C47ED78B2'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('6d901918-fff0-4895-958d-879c2cffaef3', '34987C4C-CC16-4AA3-B5BD-687C47ED78B2', 'FieldCategoryInfo', '{"Domain Configuration":{"icon":"fa fa-sliders-h","description":"General settings and UI configuration for the permission domain"},"Provider Implementation":{"icon":"fa fa-code","description":"Technical settings required for the PermissionEngine to instantiate providers"},"Provider Capabilities":{"icon":"fa fa-cogs","description":"Functional capabilities and feature flags supported by the provider"},"System Metadata":{"icon":"fa fa-database","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('b496b7c7-2bcd-46d9-8fb0-c6715bd48eac', '34987C4C-CC16-4AA3-B5BD-687C47ED78B2', 'FieldCategoryIcons', '{"Domain Configuration":"fa fa-sliders-h","Provider Implementation":"fa fa-code","Provider Capabilities":"fa fa-cogs","System Metadata":"fa fa-database"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity (category: reference, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = '34987C4C-CC16-4AA3-B5BD-687C47ED78B2'
      

/* Set categories for 17 fields */

-- UPDATE Entity Field Category Info MJ: Resource Permissions.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9EB9433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Resource Permissions.ResourceTypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Resource Reference',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A1B9433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Resource Permissions.ResourceRecordID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Resource Reference',
   GeneratedFormSection = 'Category',
   DisplayName = 'Resource Record',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A4B9433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Resource Permissions.ResourceType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '99EB5364-1B2B-430B-BC94-709C6D26AA08' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Resource Permissions.Type 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Share Type',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DE344718-4687-EF11-8473-6045BDF077EE' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Resource Permissions.PermissionLevel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E3344718-4687-EF11-8473-6045BDF077EE' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Resource Permissions.Role 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EA65A64E-9935-4702-AEDD-A2A4BDC1BCD2' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Resource Permissions.User 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1A164F09-D65D-4B1F-B954-F1A2201427F0' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Resource Permissions.RoleID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Recipient & Access Scope',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'ADB9433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Resource Permissions.UserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Recipient & Access Scope',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B0B9433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Resource Permissions.StartSharingAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Sharing Schedule & Status',
   GeneratedFormSection = 'Category',
   DisplayName = 'Start Date',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A7B9433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Resource Permissions.EndSharingAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Sharing Schedule & Status',
   GeneratedFormSection = 'Category',
   DisplayName = 'End Date',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AAB9433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Resource Permissions.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3922FE34-E68A-EF11-8473-6045BDF077EE' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Resource Permissions.SharedByUserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audit Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CCB04617-55A8-4CAA-964D-C1F38D400AAC' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Resource Permissions.SharedByUser 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audit Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '03ADA0E1-AFD7-425C-A79B-7E032BB210B9' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Resource Permissions.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B3B9433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Resource Permissions.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B6B9433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('b3f14b46-b586-4e38-8b53-ad05fdfd7850', '201852E1-4587-EF11-8473-6045BDF077EE', 'FieldCategoryInfo', '{"Audit Information":{"icon":"fa fa-user-check","description":"Details regarding who performed the sharing action"}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting (legacy) */

               UPDATE [${flyway:defaultSchema}].[EntitySetting]
               SET Value = '{"Audit Information":"fa fa-user-check"}', __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '201852E1-4587-EF11-8473-6045BDF077EE' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 21 fields */

-- UPDATE Entity Field Category Info MJ: Entity Permissions.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4B4F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Permissions.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Created At',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D45717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Permissions.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Updated At',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D55717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Permissions.EntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4C4F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Permissions.RoleID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E0939AE7-A838-EF11-86D4-000D3A4E707E' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Permissions.Entity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C65717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Permissions.RoleName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1029550C-6E47-EF11-86C3-00224821D189' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Permissions.RoleSQLName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Role SQL Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C75717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Permissions.Type 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Entity & Role Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Access Type',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '42B9846C-7A43-4763-9D03-EA12A75FE9F3' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Permissions.CanCreate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4D4F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Permissions.CanRead 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4E4F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Permissions.CanUpdate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4F4F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Permissions.CanDelete 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '504F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Permissions.ReadRLSFilterID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Read Filter ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E14217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Permissions.CreateRLSFilterID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Create Filter ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E24217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Permissions.UpdateRLSFilterID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Update Filter ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E34217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Permissions.DeleteRLSFilterID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Delete Filter ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E44217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Permissions.CreateRLSFilter 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Create Filter',
   ExtendedType = 'Code',
   CodeType = 'SQL'
WHERE 
   ID = 'C85717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Permissions.ReadRLSFilter 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Read Filter',
   ExtendedType = 'Code',
   CodeType = 'SQL'
WHERE 
   ID = 'C95717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Permissions.UpdateRLSFilter 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Update Filter',
   ExtendedType = 'Code',
   CodeType = 'SQL'
WHERE 
   ID = 'CA5717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Permissions.DeleteRLSFilter 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Delete Filter',
   ExtendedType = 'Code',
   CodeType = 'SQL'
WHERE 
   ID = 'CB5717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

/* Refresh custom base views for modified entities so schema changes are picked up */
EXEC sp_refreshview '${flyway:defaultSchema}.vwEntityPermissions';

