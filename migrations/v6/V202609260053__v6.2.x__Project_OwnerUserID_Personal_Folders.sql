-- ============================================================================
-- v6.2.x — Project.OwnerUserID: conversation folders can be PERSONAL
--
-- WHY. `Project` is the conversation sidebar's folder. Its entire column list is
-- ID, EnvironmentID, ParentID, Name, Description, Color, Icon, IsArchived — there is
-- no owner. Folders are therefore environment-wide by construction:
-- ConversationEngine.LoadProjects reads them with
-- `EnvironmentID='…' AND (IsArchived IS NULL OR IsArchived=0)` and its own docstring
-- states the consequence plainly — "Projects are environment-scoped (not
-- user-scoped)".
--
-- That is fine for a single-team environment and wrong for two things people are
-- actually asking for:
--
--   1. PERSONAL FOLDERS. There is nothing to toggle. "My drafts" cannot exist,
--      because every folder is everyone's folder.
--   2. MULTI-TENANT HOSTS. An application serving several customers from one
--      environment leaks folder NAMES between them. Conversations do not leak —
--      they carry UserID and hosts row-level-secure them — but the folder holding
--      them is readable by everyone with Read on the entity. Names are user-authored
--      free text, so "Q3 Layoff Comms" or "Acquisition — Project Bluebird" is one
--      folder away from being visible to the wrong customer. Reported from a
--      white-label deployment (Betty) where three customer-created folders were
--      readable by all 26 users across 5 organizations.
--
-- Both are the same missing column, approached from different directions, which is
-- why one column answers both.
--
-- WHAT. One additive, NULLABLE column, so nothing existing changes behaviour:
--
--   Project.OwnerUserID   UNIQUEIDENTIFIER NULL   FK -> ${flyway:defaultSchema}.User(ID)
--       NULL (default for every existing row) — SHARED: the folder is visible to the
--             environment, exactly as today.
--       set                                      — PERSONAL: the folder belongs to
--             that user. Consumers filter it to its owner.
--
-- NULL-means-shared is deliberate. The inverse (owner required, a sentinel for
-- shared) would need a backfill, would make every existing folder personal to
-- whoever happened to create it, and would give "shared" no honest representation.
-- This way the migration is a pure add: every folder that already exists stays
-- exactly as visible as it is today, and nothing is migrated.
--
-- NOTE ON THE UI DEFAULT, which is a separate decision from the column default:
-- the folder dialog now defaults a NEW folder to PERSONAL. The sidebar is a
-- personal surface (its conversations are already bound to their owner), so a
-- folder everyone can see is the surprising option. Existing folders are
-- unaffected either way — this only governs what the checkbox starts at.
--
-- Named OwnerUserID rather than UserID to match MJ's existing spelling for exactly
-- this relationship — AIAgent.OwnerUserID, ScheduledJob.OwnerUserID,
-- SearchScope.OwnerUserID, each a nullable-or-defaulted owner with an
-- FK_<table>_OwnerUserID constraint. `UserID` in MJ (Conversation, ActionExecutionLog)
-- is a different, NOT NULL "whose row is this" semantic and would read as a
-- required field here.
--
-- WHAT THIS DOES NOT DO. A column is not a policy — so this migration does not stop
-- at the column. It also attaches a row-level-security filter to the UI role's read
-- permission (see the section below the DDL), which is what makes a personal folder
-- actually unreadable rather than merely unlisted by two Angular readers. A host that
-- does nothing still sees no difference, because every folder that exists today is
-- shared and the filter admits shared folders unchanged.
--
-- What it still does not do is close the multi-tenant leak in the motivating incident:
-- those folders were SHARED, and a shared folder is readable by the environment by
-- definition. They become private when someone makes them personal, not when this
-- migration runs. Tenant separation stays the host's Environment or its own RLS choice.
--
-- The consumer-side follow-ons, kept out of the schema change so the column can land
-- and be adopted independently:
--
--   - ConversationEngine.LoadProjects gains `AND (OwnerUserID IS NULL OR
--     OwnerUserID='<contextUser.ID>')`, so a personal folder reaches only its owner,
--     and the folder-create dialog offers personal vs shared.
--   - TENANT scoping is NOT addressed here and should not be. Multi-tenant hosts
--     separate customers by Environment (which Project is already keyed on) or by
--     their own row-level security; an OrganizationID on a core MJ table would be
--     inventing a tenancy model MJ does not have. The leak described above is closed
--     for personal folders by this column, and for shared folders by the host's
--     environment or RLS choice.
-- ============================================================================

ALTER TABLE ${flyway:defaultSchema}.Project
    ADD OwnerUserID UNIQUEIDENTIFIER NULL;
GO

ALTER TABLE ${flyway:defaultSchema}.Project
    ADD CONSTRAINT FK_Project_OwnerUserID
        FOREIGN KEY (OwnerUserID) REFERENCES ${flyway:defaultSchema}.[User] (ID);
GO

-- No index here on purpose: CodeGen creates IDX_AUTO_MJ_FKEY_Project_OwnerUserID for
-- the new foreign key, the same way it did for AIAgent.OwnerUserID.

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The user who owns this folder, or NULL when the folder is shared with the whole environment. NULL (the value every pre-existing folder carries) means SHARED: visible to anyone who can read projects in the environment, which was the only possible behaviour before this column existed. A set value means PERSONAL: the folder belongs to that user and consumers filter it to them, so it stays out of other people''s sidebars. Personal is opt-in at create time; nothing is migrated.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Project', @level2type = N'COLUMN', @level2name = N'OwnerUserID';
GO

-- ============================================================================
-- SERVER-SIDE ENFORCEMENT: a personal folder is unreadable, not merely unlisted.
--
-- Without this, "personal" is a convention — two `ExtraFilter` strings in Angular
-- readers. Any user with Read on the entity still reads every personal folder NAME
-- through a direct RunView over GraphQL, the entity browser, or the Projects grid on
-- the User form. `BuildProjectVisibilityFilter` reduces the number of places a
-- developer can forget the rule; it is not a boundary, because nothing requires a
-- caller to use it.
--
-- MJ's mechanism for this is a row-level-security filter bound to a role's read
-- permission. The precedent is one day older than this column:
-- V202609201900__v6.2.x__UI_Role_Agent_Session_RLS.sql, which reasoned that "the UI
-- role is held by every ordinary user, both entities are keyed to a user, and
-- read/update with no filter means one user can read and modify another's sessions."
-- Substitute "folders" and it is this change.
--
-- SCOPE — read, and the UI role only. Developer and Integration are unfiltered, so
-- entity-admin surfaces keep seeing everything, which is the same position that
-- migration took. `UserExemptFromRowLevelSecurity` gives that for free: a user holding
-- any role whose read permission carries no filter is exempt.
--
-- WHAT IT STILL DOES NOT CLOSE, said plainly because the PR description used to
-- over-claim it: a SHARED folder (OwnerUserID IS NULL) is readable by everyone in the
-- environment. That is what "shared" means, and it is the state every folder that
-- exists today is in. The multi-tenant incident that motivated this column involved
-- shared folders, so this filter does not retroactively close it — those folders
-- become private only when someone makes them personal. Tenant separation remains the
-- host's Environment or its own RLS choice; an OrganizationID on a core MJ table would
-- be inventing a tenancy model MJ does not have.
--
-- WHY THIS IS IN A MIGRATION AND NOT UNDER metadata/. Two reasons, and they are
-- different for the two rows:
--   - The FILTER row, because `MJ: Row Level Security Filters` grants Create to no
--     role, so `mj sync push` cannot write it. The RLS migration above says so.
--   - The PERMISSION row, because its ID is generated by the DATABASE. CodeGen's
--     entity-creation output inserts EntityPermission without an explicit ID (see
--     V202606121723 for `MJ: AI Agent Sessions`), so the (Project, UI) row has a
--     different ID in every deployment. A metadata entry would have to invent one, and
--     `autoCreateMissingRecords` would then INSERT A SECOND ROW rather than attach the
--     filter to the existing one — there is no unique constraint on (EntityID, RoleID)
--     to stop it. Matching on the natural key, as below, is the only correct form.
-- ============================================================================

DECLARE @OwnFoldersRLSID UNIQUEIDENTIFIER = '7596823D-CA3B-4CE5-A66E-FC929E0FEB02';

-- The filter. Parenthesised in the text as well as by the composer: MJ wraps each
-- filter in its own parens when it ORs a user's filters together, but a bare top-level
-- OR is one refactor away from binding wrongly, and the redundancy costs nothing.
IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.RowLevelSecurityFilter WHERE ID = @OwnFoldersRLSID)
    INSERT INTO ${flyway:defaultSchema}.RowLevelSecurityFilter (ID, Name, FilterText, Description)
    VALUES (
        @OwnFoldersRLSID,
        'UI: Own or Shared Projects',
        '(OwnerUserID IS NULL OR OwnerUserID = ''{{UserID}}'')',
        'Narrows MJ: Projects to folders the current user may see: shared folders (OwnerUserID IS NULL, which is every folder that predates the column) plus their own personal folders. Attached to the UI role''s read permission, which every ordinary signed-in user holds. Without it "personal" is only a client-side convention — the folder name is still readable through a direct RunView, the entity browser, or the Projects grid on the User form. Developer and Integration are deliberately unfiltered so entity-admin surfaces are unaffected.'
    );
GO

-- Attach it to the UI role's READ permission on MJ: Projects, matching on the natural
-- key because the row's ID is database-generated. Create the permission row only if the
-- deployment somehow has none; CanCreate/Update/Delete stay 0 either way, so this can
-- only narrow reads, never widen any other verb.
DECLARE @ProjectEntityID UNIQUEIDENTIFIER = 'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A';
DECLARE @UIRoleID        UNIQUEIDENTIFIER = 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E';
DECLARE @OwnFoldersRLSID UNIQUEIDENTIFIER = '7596823D-CA3B-4CE5-A66E-FC929E0FEB02';

IF EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.EntityPermission
           WHERE EntityID = @ProjectEntityID AND RoleID = @UIRoleID)
BEGIN
    UPDATE ${flyway:defaultSchema}.EntityPermission
       SET ReadRLSFilterID = @OwnFoldersRLSID,
           __mj_UpdatedAt  = GETUTCDATE()
     WHERE EntityID = @ProjectEntityID
       AND RoleID   = @UIRoleID
       AND (ReadRLSFilterID IS NULL OR ReadRLSFilterID <> @OwnFoldersRLSID);
END
ELSE
BEGIN
    INSERT INTO ${flyway:defaultSchema}.EntityPermission
        (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete, ReadRLSFilterID, __mj_CreatedAt, __mj_UpdatedAt)
    VALUES
        (@ProjectEntityID, @UIRoleID, 1, 0, 0, 0, @OwnFoldersRLSID, GETUTCDATE(), GETUTCDATE());
END
GO


-- ============================================================================
-- ============================================================================
--
--   E V E R Y T H I N G   B E L O W   T H I S   L I N E   I S   G E N E R A T E D
--
--   Produced by the MemberJunction CodeGen tool from the schema change above.
--   DO NOT EDIT BY HAND. If the hand-written DDL at the top of this file
--   changes, re-run `mj codegen` and replace this entire section with its new
--   output rather than patching it.
--
--   Generated 2026-09-18 against a database migrated from BLANK through the
--   full chain to this migration, so the delta is attributable to
--   Project.OwnerUserID alone — the output touches the 'MJ: Projects' entity
--   and nothing else.
--
--   Contains:
--     - EntityField rows for OwnerUserID (Sequence computed at APPLY time, per
--       migrations/CLAUDE.md — never the literal CodeGen emitted)
--     - the EntityRelationship for User -> Projects
--     - regenerated vwProjects, spCreateProject, spUpdateProject,
--       spDeleteProject and the ParentID hierarchy functions
--     - IDX_AUTO_MJ_FKEY_Project_OwnerUserID (CodeGen owns FK indexes, which is
--       why the hand-written section above deliberately creates none)
--     - permission grants and extended properties
--
-- ============================================================================
-- ============================================================================

/* SQL text to insert 1 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4d40cdd7-7a73-4449-81e0-a603e5be41ab' OR (EntityID = 'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A' AND Name = 'OwnerUserID')) BEGIN
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
            '4d40cdd7-7a73-4449-81e0-a603e5be41ab',
            'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A', -- Entity: MJ: Projects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A'),
            'OwnerUserID',
            'Owner User ID',
            'The user who owns this folder, or NULL when the folder is shared with the whole environment. NULL (the value every pre-existing folder carries) means SHARED: visible to anyone who can read projects in the environment, which was the only possible behaviour before this column existed. A set value means PERSONAL: the folder belongs to that user and consumers filter it to them, so it stays out of other people''s sidebars. Personal is opt-in at create time; nothing is migrated.',
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


/* Create Entity Relationship: MJ: Users -> MJ: Projects (One To Many via OwnerUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '509b5753-3021-46d5-a8f5-967ff4c32e32'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('509b5753-3021-46d5-a8f5-967ff4c32e32', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A', 'OwnerUserID', 'One To Many', 1, 1, 106, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for Project */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Projects
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EnvironmentID in table Project
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Project_EnvironmentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Project]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Project_EnvironmentID ON [${flyway:defaultSchema}].[Project] ([EnvironmentID]);

-- Index for foreign key ParentID in table Project
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Project_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Project]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Project_ParentID ON [${flyway:defaultSchema}].[Project] ([ParentID]);

-- Index for foreign key OwnerUserID in table Project
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Project_OwnerUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Project]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Project_OwnerUserID ON [${flyway:defaultSchema}].[Project] ([OwnerUserID]);

/* SQL text to update entity field related entity name field map for entity field ID 4D40CDD7-7A73-4449-81E0-A603E5BE41AB */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='4D40CDD7-7A73-4449-81E0-A603E5BE41AB', @RelatedEntityNameFieldMap='OwnerUser';

/* Hierarchy Metadata Function SQL for MJ: Projects.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Projects
-- Item: fnProjectParentID_GetHierarchyMeta
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- HIERARCHY METADATA FUNCTION FOR: [Project].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnProjectParentID_GetHierarchyMeta]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnProjectParentID_GetHierarchyMeta];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnProjectParentID_GetHierarchyMeta]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_Ancestors AS (
        SELECT
            [ID],
            [ParentID],
            0 AS [Depth],
            CAST('/' + CAST([ID] AS NVARCHAR(36)) + '/' AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[Project]
        WHERE
            [ID] = @RecordID

        UNION ALL

        SELECT
            p.[ID],
            p.[ParentID],
            c.[Depth] + 1 AS [Depth],
            CAST('/' + CAST(p.[ID] AS NVARCHAR(36)) + c.[Path] AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[Project] p
        INNER JOIN
            CTE_Ancestors c ON p.[ID] = c.[ParentID]
        WHERE
            c.[Depth] < 100
    )
    SELECT TOP 1
        a.[ID] AS [RootID],
        (SELECT MAX([Depth]) FROM CTE_Ancestors) AS [Depth],
        (SELECT TOP 1 [Path] FROM CTE_Ancestors ORDER BY [Depth] DESC) AS [Path],
        CAST(CASE WHEN EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[Project] WHERE [ParentID] = @RecordID) THEN 0 ELSE 1 END AS BIT) AS [IsLeaf],
        (SELECT COUNT(1) FROM [${flyway:defaultSchema}].[Project] WHERE [ParentID] = @RecordID) AS [ChildCount]
    FROM
        CTE_Ancestors a
    WHERE
        a.[ParentID] IS NULL OR @ParentID IS NULL
    ORDER BY
        a.[Depth] DESC
);
GO

/* Descendants Traversal Function SQL for MJ: Projects.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Projects
-- Item: fnProjectParentID_GetDescendants
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- DESCENDANTS FUNCTION FOR: [Project].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnProjectParentID_GetDescendants]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnProjectParentID_GetDescendants];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnProjectParentID_GetDescendants]
(
    @RootID uniqueidentifier,
    @MaxDepth INT = NULL
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_Descendants AS (
        SELECT
            [ID],
            [ParentID],
            0 AS [RelativeDepth],
            CAST('/' + CAST([ID] AS NVARCHAR(36)) + '/' AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[Project]
        WHERE
            [ID] = @RootID

        UNION ALL

        SELECT
            c.[ID],
            c.[ParentID],
            p.[RelativeDepth] + 1 AS [RelativeDepth],
            CAST(p.[Path] + CAST(c.[ID] AS NVARCHAR(36)) + '/' AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[Project] c
        INNER JOIN
            CTE_Descendants p ON c.[ParentID] = p.[ID]
        WHERE
            (@MaxDepth IS NULL OR p.[RelativeDepth] < @MaxDepth)
            AND p.[RelativeDepth] < 100
    )
    SELECT
        d.[ID] AS [ID],
        d.[RelativeDepth] AS [Depth],
        d.[Path],
        CAST(CASE WHEN EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[Project] WHERE [ParentID] = d.[ID]) THEN 0 ELSE 1 END AS BIT) AS [IsLeaf],
        (SELECT COUNT(1) FROM [${flyway:defaultSchema}].[Project] WHERE [ParentID] = d.[ID]) AS [ChildCount]
    FROM
        CTE_Descendants d
);
GO

/* Ancestors Traversal Function SQL for MJ: Projects.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Projects
-- Item: fnProjectParentID_GetAncestors
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ANCESTORS FUNCTION FOR: [Project].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnProjectParentID_GetAncestors]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnProjectParentID_GetAncestors];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnProjectParentID_GetAncestors]
(
    @RecordID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_Ancestors AS (
        SELECT
            [ID],
            [ParentID],
            0 AS [LevelUp],
            CAST('/' + CAST([ID] AS NVARCHAR(36)) + '/' AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[Project]
        WHERE
            [ID] = @RecordID

        UNION ALL

        SELECT
            p.[ID],
            p.[ParentID],
            c.[LevelUp] + 1 AS [LevelUp],
            CAST('/' + CAST(p.[ID] AS NVARCHAR(36)) + c.[Path] AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[Project] p
        INNER JOIN
            CTE_Ancestors c ON p.[ID] = c.[ParentID]
        WHERE
            c.[LevelUp] < 100
    )
    SELECT
        a.[ID] AS [ID],
        a.[LevelUp],
        a.[Path]
    FROM
        CTE_Ancestors a
);
GO

/* Root ID Function SQL for MJ: Projects.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Projects
-- Item: fnProjectParentID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [Project].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnProjectParentID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnProjectParentID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnProjectParentID_GetRootID]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        SELECT
            [ID],
            [ParentID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[Project]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        SELECT
            c.[ID],
            c.[ParentID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[Project] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[ParentID]
        WHERE
            p.[Depth] < 100
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [ParentID] IS NULL
    ORDER BY
        [RootParentID]
);
GO

/* Base View SQL for MJ: Projects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Projects
-- Item: vwProjects
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Projects
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Project
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwProjects]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwProjects];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwProjects]
AS
SELECT
    p.*,
    MJEnvironment_EnvironmentID.[Name] AS [Environment],
    MJProject_ParentID.[Name] AS [Parent],
    MJUser_OwnerUserID.[Name] AS [OwnerUser],
    hier_ParentID.RootID AS [RootParentID],
    hier_ParentID.Depth AS [ParentIDDepth],
    hier_ParentID.Path AS [ParentIDPath],
    hier_ParentID.IsLeaf AS [ParentIDIsLeaf],
    hier_ParentID.ChildCount AS [ParentIDChildCount]
FROM
    [${flyway:defaultSchema}].[Project] AS p
INNER JOIN
    [${flyway:defaultSchema}].[Environment] AS MJEnvironment_EnvironmentID
  ON
    [p].[EnvironmentID] = MJEnvironment_EnvironmentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Project] AS MJProject_ParentID
  ON
    [p].[ParentID] = MJProject_ParentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_OwnerUserID
  ON
    [p].[OwnerUserID] = MJUser_OwnerUserID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnProjectParentID_GetHierarchyMeta]([p].[ID], [p].[ParentID]) AS hier_ParentID
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwProjects] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwProjects] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwProjects] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwProjects] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Projects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Projects
-- Item: Permissions for vwProjects
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwProjects] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwProjects] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwProjects] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwProjects] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Projects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Projects
-- Item: spCreateProject
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Project
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateProject]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateProject];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateProject]
    @ID uniqueidentifier = NULL,
    @EnvironmentID uniqueidentifier = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Color_Clear bit = 0,
    @Color nvarchar(7) = NULL,
    @Icon_Clear bit = 0,
    @Icon nvarchar(50) = NULL,
    @IsArchived bit = NULL,
    @OwnerUserID_Clear bit = 0,
    @OwnerUserID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Project]
            (
                [ID],
                [EnvironmentID],
                [ParentID],
                [Name],
                [Description],
                [Color],
                [Icon],
                [IsArchived],
                [OwnerUserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                CASE WHEN @EnvironmentID = '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE ISNULL(@EnvironmentID, 'F51358F3-9447-4176-B313-BF8025FD8D09') END,
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Color_Clear = 1 THEN NULL ELSE ISNULL(@Color, NULL) END,
                CASE WHEN @Icon_Clear = 1 THEN NULL ELSE ISNULL(@Icon, NULL) END,
                ISNULL(@IsArchived, 0),
                CASE WHEN @OwnerUserID_Clear = 1 THEN NULL ELSE ISNULL(@OwnerUserID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Project]
            (
                [EnvironmentID],
                [ParentID],
                [Name],
                [Description],
                [Color],
                [Icon],
                [IsArchived],
                [OwnerUserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                CASE WHEN @EnvironmentID = '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE ISNULL(@EnvironmentID, 'F51358F3-9447-4176-B313-BF8025FD8D09') END,
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Color_Clear = 1 THEN NULL ELSE ISNULL(@Color, NULL) END,
                CASE WHEN @Icon_Clear = 1 THEN NULL ELSE ISNULL(@Icon, NULL) END,
                ISNULL(@IsArchived, 0),
                CASE WHEN @OwnerUserID_Clear = 1 THEN NULL ELSE ISNULL(@OwnerUserID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwProjects] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateProject] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateProject] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateProject] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Projects */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateProject] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateProject] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateProject] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Projects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Projects
-- Item: spUpdateProject
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Project
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateProject]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateProject];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateProject]
    @ID uniqueidentifier,
    @EnvironmentID uniqueidentifier = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Color_Clear bit = 0,
    @Color nvarchar(7) = NULL,
    @Icon_Clear bit = 0,
    @Icon nvarchar(50) = NULL,
    @IsArchived bit = NULL,
    @OwnerUserID_Clear bit = 0,
    @OwnerUserID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Project]
    SET
        [EnvironmentID] = ISNULL(@EnvironmentID, [EnvironmentID]),
        [ParentID] = CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, [ParentID]) END,
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Color] = CASE WHEN @Color_Clear = 1 THEN NULL ELSE ISNULL(@Color, [Color]) END,
        [Icon] = CASE WHEN @Icon_Clear = 1 THEN NULL ELSE ISNULL(@Icon, [Icon]) END,
        [IsArchived] = ISNULL(@IsArchived, [IsArchived]),
        [OwnerUserID] = CASE WHEN @OwnerUserID_Clear = 1 THEN NULL ELSE ISNULL(@OwnerUserID, [OwnerUserID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwProjects] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwProjects]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateProject] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateProject] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProject] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Project table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateProject]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateProject];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateProject
ON [${flyway:defaultSchema}].[Project]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Project]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Project] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Projects */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateProject] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateProject] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProject] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Projects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Projects
-- Item: spDeleteProject
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Project
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteProject]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteProject];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteProject]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Project]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteProject] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteProject] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteProject] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Projects */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteProject] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteProject] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteProject] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 1 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '36a2c7e2-3e20-4349-8c19-2850e0ecea38' OR (EntityID = 'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A' AND Name = 'OwnerUser')) BEGIN
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
            '36a2c7e2-3e20-4349-8c19-2850e0ecea38',
            'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A', -- Entity: MJ: Projects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A'),
            'OwnerUser',
            'Owner User',
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

