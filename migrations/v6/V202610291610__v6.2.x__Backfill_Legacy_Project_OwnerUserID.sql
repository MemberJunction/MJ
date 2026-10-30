-- ============================================================================
-- v6.2.x — Backfill OwnerUserID on legacy conversation folders (Project)
--
-- WHY. When V202609260053 introduced `Project.OwnerUserID`, it left pre-existing
-- folders with `OwnerUserID = NULL` (shared) because at that point a shared
-- folder only shared the folder's name while conversations inside it remained
-- private to their creator.
--
-- Shared folders (`OwnerUserID IS NULL`) now automatically share the
-- conversations placed inside them (View-only by default), and new folders
-- default to private (`OwnerUserID = <currentUser.ID>`). Leaving legacy folders
-- with `OwnerUserID = NULL` on upgrade would unintentionally share every
-- conversation inside those pre-existing folders with the entire environment.
--
-- WHAT. Backfill `OwnerUserID` on legacy `Project` rows where `OwnerUserID IS NULL`
-- and the folder was not explicitly converted from personal to shared (no Update
-- in `RecordChange` touching `OwnerUserID`). Owner resolution order:
--   1. Earliest conversation directly inside the folder (`Conversation.UserID`)
--   2. Earliest conversation in any descendant subfolder
--   3. Earliest `RecordChange` audit entry for the folder (`Create` preferred)
--   4. Nearest ancestor folder's `OwnerUserID` (for empty nested subfolders)
-- ============================================================================

DECLARE @ProjectEntityID UNIQUEIDENTIFIER = 'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A';

-- Pass 1: Backfill OwnerUserID from (1) direct conversations, (2) descendant
--         conversations, or (3) RecordChange audit history, excluding any folder
--         that was explicitly updated to shared (OwnerUserID -> NULL).
;WITH FolderHierarchy AS (
    SELECT
        p.ID AS RootProjectID,
        p.ID AS DescendantProjectID,
        0    AS Depth
    FROM ${flyway:defaultSchema}.Project p
    WHERE p.OwnerUserID IS NULL

    UNION ALL

    SELECT
        fh.RootProjectID,
        child.ID AS DescendantProjectID,
        fh.Depth + 1
    FROM FolderHierarchy fh
    INNER JOIN ${flyway:defaultSchema}.Project child
        ON child.ParentID = fh.DescendantProjectID
    WHERE fh.Depth < 10
),
ResolvedOwners AS (
    SELECT
        p.ID AS ProjectID,
        COALESCE(
            -- 1. Earliest conversation directly inside this folder
            (
                SELECT TOP 1 c.UserID
                FROM ${flyway:defaultSchema}.Conversation c
                INNER JOIN ${flyway:defaultSchema}.[User] u ON u.ID = c.UserID
                WHERE c.ProjectID = p.ID
                  AND c.UserID IS NOT NULL
                ORDER BY c.__mj_CreatedAt ASC, c.ID ASC
            ),
            -- 2. Earliest conversation in any descendant subfolder
            (
                SELECT TOP 1 c.UserID
                FROM FolderHierarchy fh
                INNER JOIN ${flyway:defaultSchema}.Conversation c ON c.ProjectID = fh.DescendantProjectID
                INNER JOIN ${flyway:defaultSchema}.[User] u ON u.ID = c.UserID
                WHERE fh.RootProjectID = p.ID
                  AND fh.Depth > 0
                  AND c.UserID IS NOT NULL
                ORDER BY fh.Depth ASC, c.__mj_CreatedAt ASC, c.ID ASC
            ),
            -- 3. Earliest RecordChange user for this Project record
            (
                SELECT TOP 1 rc.UserID
                FROM ${flyway:defaultSchema}.RecordChange rc
                INNER JOIN ${flyway:defaultSchema}.[User] u ON u.ID = rc.UserID
                WHERE rc.EntityID = @ProjectEntityID
                  AND rc.RecordID IN (
                      N'ID|' + CAST(p.ID AS NVARCHAR(50)),
                      CAST(p.ID AS NVARCHAR(50))
                  )
                  AND rc.UserID IS NOT NULL
                ORDER BY
                    CASE WHEN rc.Type = N'Create' THEN 0 ELSE 1 END ASC,
                    rc.ChangedAt ASC,
                    rc.ID ASC
            )
        ) AS InferredOwnerUserID
    FROM ${flyway:defaultSchema}.Project p
    WHERE p.OwnerUserID IS NULL
      AND NOT EXISTS (
          SELECT 1
          FROM ${flyway:defaultSchema}.RecordChange rcSwitch
          WHERE rcSwitch.EntityID = @ProjectEntityID
            AND rcSwitch.RecordID IN (
                N'ID|' + CAST(p.ID AS NVARCHAR(50)),
                CAST(p.ID AS NVARCHAR(50))
            )
            AND rcSwitch.Type = N'Update'
            AND rcSwitch.ChangesJSON LIKE N'%"OwnerUserID"%'
      )
)
UPDATE p
SET
    p.OwnerUserID    = ro.InferredOwnerUserID,
    p.__mj_UpdatedAt = GETUTCDATE()
FROM ${flyway:defaultSchema}.Project p
INNER JOIN ResolvedOwners ro ON ro.ProjectID = p.ID
WHERE ro.InferredOwnerUserID IS NOT NULL;
GO

-- Pass 2: Propagate OwnerUserID from ancestor folders to any remaining empty
--         legacy child folders whose parent now has an owner.
DECLARE @ProjectEntityID UNIQUEIDENTIFIER = 'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A';

;WITH AncestorOwners AS (
    SELECT
        p.ID               AS ProjectID,
        parent.OwnerUserID AS AncestorOwnerUserID,
        1                  AS Distance
    FROM ${flyway:defaultSchema}.Project p
    INNER JOIN ${flyway:defaultSchema}.Project parent
        ON parent.ID = p.ParentID
    WHERE p.OwnerUserID IS NULL
      AND parent.OwnerUserID IS NOT NULL

    UNION ALL

    SELECT
        child.ID               AS ProjectID,
        ao.AncestorOwnerUserID,
        ao.Distance + 1
    FROM AncestorOwners ao
    INNER JOIN ${flyway:defaultSchema}.Project child
        ON child.ParentID = ao.ProjectID
    WHERE child.OwnerUserID IS NULL
      AND ao.Distance < 10
),
NearestAncestorOwner AS (
    SELECT
        ProjectID,
        AncestorOwnerUserID,
        ROW_NUMBER() OVER (PARTITION BY ProjectID ORDER BY Distance ASC) AS rn
    FROM AncestorOwners
)
UPDATE p
SET
    p.OwnerUserID    = nao.AncestorOwnerUserID,
    p.__mj_UpdatedAt = GETUTCDATE()
FROM ${flyway:defaultSchema}.Project p
INNER JOIN NearestAncestorOwner nao
    ON nao.ProjectID = p.ID
   AND nao.rn = 1
WHERE p.OwnerUserID IS NULL
  AND NOT EXISTS (
      SELECT 1
      FROM ${flyway:defaultSchema}.RecordChange rcSwitch
      WHERE rcSwitch.EntityID = @ProjectEntityID
        AND rcSwitch.RecordID IN (
            N'ID|' + CAST(p.ID AS NVARCHAR(50)),
            CAST(p.ID AS NVARCHAR(50))
        )
        AND rcSwitch.Type = N'Update'
        AND rcSwitch.ChangesJSON LIKE N'%"OwnerUserID"%'
  );
GO

-- ============================================================================
-- Ensure the 'Projects' (Conversation Folders) ResourceType exists so folder-
-- level ResourcePermission grants satisfy FK_ResourcePermission_ResourceType
-- immediately after running Flyway migrations (before mj sync push).
-- ============================================================================
DECLARE @ProjectsResourceTypeID UNIQUEIDENTIFIER = '88D0DF27-AF8F-43AC-9EC4-2AC314F49355';
DECLARE @ProjectsEntityID UNIQUEIDENTIFIER = 'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A';

IF NOT EXISTS (
    SELECT 1
    FROM ${flyway:defaultSchema}.ResourceType
    WHERE ID = @ProjectsResourceTypeID
       OR Name = N'Projects'
)
BEGIN
    INSERT INTO ${flyway:defaultSchema}.ResourceType (
        ID,
        Name,
        DisplayName,
        Description,
        Icon,
        EntityID,
        __mj_CreatedAt,
        __mj_UpdatedAt,
        CategoryEntityID,
        DriverClass
    )
    VALUES (
        @ProjectsResourceTypeID,
        N'Projects',
        N'Conversation Folders',
        N'Conversation folders that organize conversations and support folder-level sharing',
        N'fa-solid fa-folder',
        @ProjectsEntityID,
        GETUTCDATE(),
        GETUTCDATE(),
        NULL,
        NULL
    );
END
GO

-- ============================================================================
-- Update UI role's Read RLS filter on MJ: Projects so folders shared with
-- specific Users or Roles via MJ: Resource Permissions (ResourceType 'Projects',
-- ID '88D0DF27-AF8F-43AC-9EC4-2AC314F49355') are readable alongside public
-- folders (OwnerUserID IS NULL) and the user's own folders.
-- ============================================================================
DECLARE @OwnFoldersRLSID UNIQUEIDENTIFIER = '7596823D-CA3B-4CE5-A66E-FC929E0FEB02';

UPDATE ${flyway:defaultSchema}.RowLevelSecurityFilter
   SET FilterText = N'(OwnerUserID IS NULL OR OwnerUserID = ''{{UserID}}'' OR EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.[ResourcePermission] AS [rp] WHERE [rp].[ResourceTypeID] = ''88D0DF27-AF8F-43AC-9EC4-2AC314F49355'' AND [rp].[ResourceRecordID] = CAST([ID] AS NVARCHAR(255)) AND [rp].[Status] = N''Approved'' AND (([rp].[Type] = N''User'' AND [rp].[UserID] = ''{{UserID}}'') OR ([rp].[Type] = N''Role'' AND [rp].[RoleID] IN (SELECT [ur].[RoleID] FROM ${flyway:defaultSchema}.[UserRole] AS [ur] WHERE [ur].[UserID] = ''{{UserID}}'')))))',
       Description = N'Narrows MJ: Projects to folders the current user may see: public folders (OwnerUserID IS NULL), their own folders (OwnerUserID = {{UserID}}), and folders shared with them or their roles via MJ: Resource Permissions.',
       __mj_UpdatedAt = GETUTCDATE()
 WHERE ID = @OwnFoldersRLSID;
GO

