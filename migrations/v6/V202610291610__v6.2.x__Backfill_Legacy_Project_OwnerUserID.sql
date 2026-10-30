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
--   1. The user who created the folder (`RecordChange` Create entry)
--   2. Earliest conversation directly inside the folder (`Conversation.UserID`)
--   3. Earliest conversation in any descendant subfolder
--   4. Earliest other `RecordChange` audit entry for the folder
--   5. Nearest ancestor folder's `OwnerUserID` (for empty nested subfolders)
--
-- Then every existing conversation that sits in a Public folder, or in a folder
-- owned by someone else, is stamped `"inheritFolderAccess": false` so the upgrade
-- shows no conversation to anyone who could not see it before (Pass 3).
-- ============================================================================

DECLARE @ProjectEntityID UNIQUEIDENTIFIER = 'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A';

-- Pass 1: Backfill OwnerUserID from (1) the folder's creator, (2) direct
--         conversations, (3) descendant conversations, or (4) other RecordChange
--         history, excluding any folder that was explicitly updated to shared
--         (OwnerUserID -> NULL). The creator outranks conversation authorship: in a
--         folder several people used, the first conversation's author is not the owner.
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
            -- 1. The user who created this folder
            (
                SELECT TOP 1 rc.UserID
                FROM ${flyway:defaultSchema}.RecordChange rc
                INNER JOIN ${flyway:defaultSchema}.[User] u ON u.ID = rc.UserID
                WHERE rc.EntityID = @ProjectEntityID
                  AND rc.RecordID IN (
                      N'ID|' + CAST(p.ID AS NVARCHAR(50)),
                      CAST(p.ID AS NVARCHAR(50))
                  )
                  AND rc.Type = N'Create'
                  AND rc.UserID IS NOT NULL
                ORDER BY rc.ChangedAt ASC, rc.ID ASC
            ),
            -- 2. Earliest conversation directly inside this folder
            (
                SELECT TOP 1 c.UserID
                FROM ${flyway:defaultSchema}.Conversation c
                INNER JOIN ${flyway:defaultSchema}.[User] u ON u.ID = c.UserID
                WHERE c.ProjectID = p.ID
                  AND c.UserID IS NOT NULL
                ORDER BY c.__mj_CreatedAt ASC, c.ID ASC
            ),
            -- 3. Earliest conversation in any descendant subfolder
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
            -- 4. Earliest other RecordChange user for this Project record
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
                ORDER BY rc.ChangedAt ASC, rc.ID ASC
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

-- Pass 3: Keep every existing conversation exactly as visible as it was.
--         Before v6.2.x a folder shared only its name; the conversations in it
--         stayed private to their creators. Folders now share their conversations
--         (a Public folder with everyone, a Shared folder with its grantees, and a
--         folder's owner sees the conversations in it). So an existing conversation
--         in a Public folder, or in a folder someone else owns, keeps its old
--         visibility by opting out of folder inheritance. Conversations created after
--         the upgrade inherit by default. Re-running sets the same value again.
--         AdditionalData that is not a JSON object is kept, not overwritten: it moves
--         under "previousAdditionalData" as a JSON string. Empty or NULL becomes a new
--         object.
UPDATE c
SET
    c.AdditionalData = CASE
        WHEN ISJSON(c.AdditionalData) = 1 AND LEFT(LTRIM(c.AdditionalData), 1) = N'{'
            THEN JSON_MODIFY(c.AdditionalData, '$.inheritFolderAccess', CAST(0 AS BIT))
        WHEN c.AdditionalData IS NULL OR LTRIM(RTRIM(c.AdditionalData)) = N''
            THEN N'{"inheritFolderAccess":false}'
        ELSE N'{"inheritFolderAccess":false,"previousAdditionalData":"' + STRING_ESCAPE(c.AdditionalData, 'json') + N'"}'
    END,
    c.__mj_UpdatedAt = GETUTCDATE()
FROM ${flyway:defaultSchema}.Conversation c
INNER JOIN ${flyway:defaultSchema}.Project p ON p.ID = c.ProjectID
WHERE p.OwnerUserID IS NULL
   OR c.UserID IS NULL
   OR p.OwnerUserID <> c.UserID;
GO

-- ============================================================================
-- Update UI role's Read RLS filter on MJ: Projects so folders shared with
-- specific Users or Roles via MJ: Resource Permissions (ResourceType 'Projects',
-- ID '88D0DF27-AF8F-43AC-9EC4-2AC314F49355') are readable alongside public
-- folders (OwnerUserID IS NULL) and the user's own folders.
--
-- The folder's [ID] sits OUTSIDE the ResourcePermission subquery on purpose:
-- inside it, an unqualified [ID] binds to [rp].[ID] (ResourcePermission has its
-- own ID column), which matches no real grant and lets a grant that points at
-- itself open every folder.
-- ============================================================================
DECLARE @OwnFoldersRLSID UNIQUEIDENTIFIER = '7596823D-CA3B-4CE5-A66E-FC929E0FEB02';
DECLARE @NewFilterText NVARCHAR(MAX) = N'(OwnerUserID IS NULL OR OwnerUserID = ''{{UserID}}'' OR CAST([ID] AS NVARCHAR(36)) IN (SELECT [rp].[ResourceRecordID] FROM ${flyway:defaultSchema}.[ResourcePermission] AS [rp] WHERE [rp].[ResourceTypeID] = ''88D0DF27-AF8F-43AC-9EC4-2AC314F49355'' AND [rp].[Status] = N''Approved'' AND (([rp].[Type] = N''User'' AND [rp].[UserID] = ''{{UserID}}'') OR ([rp].[Type] = N''Role'' AND [rp].[RoleID] IN (SELECT [ur].[RoleID] FROM ${flyway:defaultSchema}.[UserRole] AS [ur] WHERE [ur].[UserID] = ''{{UserID}}'')))))';

-- Replace the filter only while it still holds V202609260053's text (or this
-- migration's own, on a re-run). A host that edited the filter keeps its version
-- and is told to merge the shared-folder clause in by hand.
UPDATE ${flyway:defaultSchema}.RowLevelSecurityFilter
   SET FilterText = @NewFilterText,
       Description = N'Narrows MJ: Projects to folders the current user may see: public folders (OwnerUserID IS NULL), their own folders (OwnerUserID = {{UserID}}), and folders shared with them or their roles via MJ: Resource Permissions.',
       __mj_UpdatedAt = GETUTCDATE()
 WHERE ID = @OwnFoldersRLSID
   AND FilterText IN (N'(OwnerUserID IS NULL OR OwnerUserID = ''{{UserID}}'')', @NewFilterText);

IF @@ROWCOUNT = 0
    PRINT 'RowLevelSecurityFilter 7596823D-CA3B-4CE5-A66E-FC929E0FEB02 was edited after V202609260053, so it was left as is. Add the shared-folder clause from this migration to it by hand to let users read folders shared with them.';
GO

