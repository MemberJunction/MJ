-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202611021720__v6.2.x__Backfill_Legacy_Project_OwnerUserID.sql
-- Hand-ported PostgreSQL counterpart (data backfill + one RLS filter update; no DDL,
-- no CodeGen output).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

-- ╔══ CONVERSION GAPS — RESOLVED BY HAND ══╗
-- The transpiler could not emit 8 statements (T-SQL variables, recursive CTEs feeding
-- UPDATE … FROM, TOP 1, @@ROWCOUNT / PRINT). All three steps are ported by hand:
--  Pass 1  WITH RECURSIVE … UPDATE … FROM: OwnerUserID from (1) the folder's RecordChange
--          Create user, (2) earliest direct conversation, (3) earliest descendant
--          conversation, (4) earliest other RecordChange user — skipping folders explicitly
--          switched to shared (an Update RecordChange touching OwnerUserID).
--  Pass 2  WITH RECURSIVE … UPDATE … FROM: nearest ancestor's OwnerUserID for the empty
--          legacy subfolders that remain.
--  RLS     UPDATE of RowLevelSecurityFilter 7596823D-…: same FilterText as SQL Server (with the
--          schema placeholder resolved to __mj; the PostgreSQL provider converts the [bracket]
--          notation at query time), guarded on the V202609260053 text; PRINT → RAISE NOTICE.
-- RecordChange.RecordID is compared case-insensitively: SQL Server's CAST(uniqueidentifier AS
-- NVARCHAR) is upper-case while uuid::text is lower-case, and stored values may be either.
-- GETUTCDATE() → NOW() (__mj_UpdatedAt is TIMESTAMPTZ).
-- ╚════════════════════════════════════════╝

-- Pass 1: Backfill OwnerUserID from the creator, direct conversations, descendant
--         conversations, or other RecordChange history, excluding folders explicitly
--         updated to shared (OwnerUserID -> NULL).
WITH RECURSIVE "FolderHierarchy" AS (
    SELECT
        p."ID" AS "RootProjectID",
        p."ID" AS "DescendantProjectID",
        0      AS "Depth"
    FROM __mj."Project" p
    WHERE p."OwnerUserID" IS NULL

    UNION ALL

    SELECT
        fh."RootProjectID",
        child."ID" AS "DescendantProjectID",
        fh."Depth" + 1
    FROM "FolderHierarchy" fh
    INNER JOIN __mj."Project" child
        ON child."ParentID" = fh."DescendantProjectID"
    WHERE fh."Depth" < 10
),
"ResolvedOwners" AS (
    SELECT
        p."ID" AS "ProjectID",
        COALESCE(
            -- 1. The user who created this folder
            (
                SELECT rc."UserID"
                FROM __mj."RecordChange" rc
                INNER JOIN __mj."User" u ON u."ID" = rc."UserID"
                WHERE rc."EntityID" = 'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A'
                  AND LOWER(rc."RecordID") IN (LOWER('ID|' || p."ID"::text), LOWER(p."ID"::text))
                  AND rc."Type" = 'Create'
                  AND rc."UserID" IS NOT NULL
                ORDER BY rc."ChangedAt" ASC, rc."ID" ASC
                LIMIT 1
            ),
            -- 2. Earliest conversation directly inside this folder
            (
                SELECT c."UserID"
                FROM __mj."Conversation" c
                INNER JOIN __mj."User" u ON u."ID" = c."UserID"
                WHERE c."ProjectID" = p."ID"
                  AND c."UserID" IS NOT NULL
                ORDER BY c."__mj_CreatedAt" ASC, c."ID" ASC
                LIMIT 1
            ),
            -- 3. Earliest conversation in any descendant subfolder
            (
                SELECT c."UserID"
                FROM "FolderHierarchy" fh
                INNER JOIN __mj."Conversation" c ON c."ProjectID" = fh."DescendantProjectID"
                INNER JOIN __mj."User" u ON u."ID" = c."UserID"
                WHERE fh."RootProjectID" = p."ID"
                  AND fh."Depth" > 0
                  AND c."UserID" IS NOT NULL
                ORDER BY fh."Depth" ASC, c."__mj_CreatedAt" ASC, c."ID" ASC
                LIMIT 1
            ),
            -- 4. Earliest other RecordChange user for this Project record
            (
                SELECT rc."UserID"
                FROM __mj."RecordChange" rc
                INNER JOIN __mj."User" u ON u."ID" = rc."UserID"
                WHERE rc."EntityID" = 'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A'
                  AND LOWER(rc."RecordID") IN (LOWER('ID|' || p."ID"::text), LOWER(p."ID"::text))
                  AND rc."UserID" IS NOT NULL
                ORDER BY rc."ChangedAt" ASC, rc."ID" ASC
                LIMIT 1
            )
        ) AS "InferredOwnerUserID"
    FROM __mj."Project" p
    WHERE p."OwnerUserID" IS NULL
      AND NOT EXISTS (
          SELECT 1
          FROM __mj."RecordChange" rcSwitch
          WHERE rcSwitch."EntityID" = 'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A'
            AND LOWER(rcSwitch."RecordID") IN (LOWER('ID|' || p."ID"::text), LOWER(p."ID"::text))
            AND rcSwitch."Type" = 'Update'
            AND rcSwitch."ChangesJSON" LIKE '%"OwnerUserID"%'
      )
)
UPDATE __mj."Project" p
SET
    "OwnerUserID"    = ro."InferredOwnerUserID",
    "__mj_UpdatedAt" = NOW()
FROM "ResolvedOwners" ro
WHERE ro."ProjectID" = p."ID"
  AND ro."InferredOwnerUserID" IS NOT NULL;

-- Pass 2: Propagate OwnerUserID from ancestor folders to any remaining empty
--         legacy child folders whose parent now has an owner.
WITH RECURSIVE "AncestorOwners" AS (
    SELECT
        p."ID"                AS "ProjectID",
        parent."OwnerUserID"  AS "AncestorOwnerUserID",
        1                     AS "Distance"
    FROM __mj."Project" p
    INNER JOIN __mj."Project" parent
        ON parent."ID" = p."ParentID"
    WHERE p."OwnerUserID" IS NULL
      AND parent."OwnerUserID" IS NOT NULL

    UNION ALL

    SELECT
        child."ID"                AS "ProjectID",
        ao."AncestorOwnerUserID",
        ao."Distance" + 1
    FROM "AncestorOwners" ao
    INNER JOIN __mj."Project" child
        ON child."ParentID" = ao."ProjectID"
    WHERE child."OwnerUserID" IS NULL
      AND ao."Distance" < 10
),
"NearestAncestorOwner" AS (
    SELECT
        "ProjectID",
        "AncestorOwnerUserID",
        ROW_NUMBER() OVER (PARTITION BY "ProjectID" ORDER BY "Distance" ASC) AS rn
    FROM "AncestorOwners"
)
UPDATE __mj."Project" p
SET
    "OwnerUserID"    = nao."AncestorOwnerUserID",
    "__mj_UpdatedAt" = NOW()
FROM "NearestAncestorOwner" nao
WHERE nao."ProjectID" = p."ID"
  AND nao.rn = 1
  AND p."OwnerUserID" IS NULL
  AND NOT EXISTS (
      SELECT 1
      FROM __mj."RecordChange" rcSwitch
      WHERE rcSwitch."EntityID" = 'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A'
        AND LOWER(rcSwitch."RecordID") IN (LOWER('ID|' || p."ID"::text), LOWER(p."ID"::text))
        AND rcSwitch."Type" = 'Update'
        AND rcSwitch."ChangesJSON" LIKE '%"OwnerUserID"%'
  );

-- ============================================================================
-- Update UI role's Read RLS filter on MJ: Projects so folders shared with
-- specific Users or Roles via MJ: Resource Permissions (ResourceType 'Projects',
-- ID '88D0DF27-AF8F-43AC-9EC4-2AC314F49355') are readable alongside public
-- folders (OwnerUserID IS NULL) and the user's own folders.
-- Replace the filter only while it still holds V202609260053's text (or this
-- migration's own, on a re-run). A host that edited the filter keeps its version.
-- ============================================================================
DO $rls$
DECLARE
    v_NewFilterText TEXT := '(OwnerUserID IS NULL OR OwnerUserID = ''{{UserID}}'' OR CAST([ID] AS NVARCHAR(36)) IN (SELECT [rp].[ResourceRecordID] FROM __mj.[ResourcePermission] AS [rp] WHERE [rp].[ResourceTypeID] = ''88D0DF27-AF8F-43AC-9EC4-2AC314F49355'' AND [rp].[Status] = N''Approved'' AND (([rp].[Type] = N''User'' AND [rp].[UserID] = ''{{UserID}}'') OR ([rp].[Type] = N''Role'' AND [rp].[RoleID] IN (SELECT [ur].[RoleID] FROM __mj.[UserRole] AS [ur] WHERE [ur].[UserID] = ''{{UserID}}'')))))';
    v_RowCount INTEGER;
BEGIN
    UPDATE __mj."RowLevelSecurityFilter"
       SET "FilterText" = v_NewFilterText,
           "Description" = 'Narrows MJ: Projects to folders the current user may see: public folders (OwnerUserID IS NULL), their own folders (OwnerUserID = {{UserID}}), and folders shared with them or their roles via MJ: Resource Permissions.',
           "__mj_UpdatedAt" = NOW()
     WHERE "ID" = '7596823D-CA3B-4CE5-A66E-FC929E0FEB02'
       AND "FilterText" IN ('(OwnerUserID IS NULL OR OwnerUserID = ''{{UserID}}'')', v_NewFilterText);

    GET DIAGNOSTICS v_RowCount = ROW_COUNT;
    IF v_RowCount = 0 THEN
        RAISE NOTICE 'RowLevelSecurityFilter 7596823D-CA3B-4CE5-A66E-FC929E0FEB02 was edited after V202609260053, so it was left as is. Add the shared-folder clause from this migration to it by hand to let users read folders shared with them.';
    END IF;
END
$rls$;
