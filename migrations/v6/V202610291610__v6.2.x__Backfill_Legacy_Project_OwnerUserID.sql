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
