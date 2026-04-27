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
























































































