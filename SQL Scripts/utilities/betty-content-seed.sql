-- =============================================================================
-- Betty Content seed — link existing __mj.ContentItem rows into the
-- betty.ContentItem TPT extension so BettyNext can search them.
-- =============================================================================
-- Idempotent: re-running it skips rows that already have a betty.ContentItem
-- partner row. Adjust @OrgID / @OrgName / @SourcePrefix to taste before running.
--
-- Strategy:
--   1. Ensure a betty.Organization row exists (hardcoded UUID so the same
--      OrganizationID can be reused across environments / passed into
--      BettyNext as PrimaryScopeRecordID).
--   2. For every __mj.ContentItem that does NOT yet have a betty.ContentItem
--      row, create one:
--        - betty.ContentItem.ID = __mj.ContentItem.ID (TPT shared key)
--        - OrganizationID       = the seeded org
--        - SourceIdentifier     = COALESCE(URL, Name, ID-as-string)
--        - Decorator            = NULL (set per-row later if useful)
--        - UserLink             = URL (if any)
--        - ParentID             = NULL (top-level items only;
--                                  chunk hierarchy is owned by ingest)
-- =============================================================================

DECLARE @OrgID   UNIQUEIDENTIFIER = 'D7E91C0F-2C5E-4B43-9C5A-9D6B7E1F0A11'; -- !! customize !!
DECLARE @OrgName NVARCHAR(255)    = 'Betty Test Org';                       -- !! customize !!

-- 1. Upsert organization
IF NOT EXISTS (SELECT 1 FROM betty.Organization WHERE ID = @OrgID)
BEGIN
    INSERT INTO betty.Organization (ID, Name, Description)
    VALUES (@OrgID, @OrgName, 'Seed org for BettyNext local testing.');
END
ELSE
BEGIN
    UPDATE betty.Organization
    SET Name = @OrgName
    WHERE ID = @OrgID;
END

-- 2. Backfill betty.ContentItem rows for every __mj.ContentItem missing one
INSERT INTO betty.ContentItem (ID, OrganizationID, Decorator, SourceIdentifier, UserLink, ParentID)
SELECT
    ci.ID,
    @OrgID,
    NULL,
    COALESCE(NULLIF(ci.URL, ''), NULLIF(ci.[Name], ''), CONVERT(NVARCHAR(36), ci.ID)),
    ci.URL,
    NULL
FROM __mj.ContentItem ci
LEFT JOIN betty.ContentItem bci ON bci.ID = ci.ID
WHERE bci.ID IS NULL;

-- Sanity check
SELECT
    @OrgID AS OrganizationID,
    (SELECT COUNT(*) FROM betty.ContentItem WHERE OrganizationID = @OrgID) AS BettyContentItems,
    (SELECT COUNT(*) FROM __mj.ContentItem)                                 AS MJContentItemsTotal,
    (SELECT COUNT(*) FROM __mj.ContentItem ci
       JOIN betty.ContentItem bci ON bci.ID = ci.ID
      WHERE bci.OrganizationID = @OrgID)                                    AS LinkedThisOrg;
