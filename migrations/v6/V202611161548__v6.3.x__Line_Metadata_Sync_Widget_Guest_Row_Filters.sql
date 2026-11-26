-- Line-only metadata sync for lts/6.1: the metadata half of the #6165 backport (security fix in
-- Widget Guest row filters). The backport's V202611161547 seeds the filter rows; the links from the
-- Widget Guest entity permissions to those filters live in
-- metadata/entity-permissions/.entity-permissions.json. On next they reached databases through the
-- release metadata sync (V202611180023), which can't come to the line, and line hosts get metadata
-- only through `mj migrate`. Without this file a host would get the code and the filter rows only.
--
-- WHAT IT UPDATES (6 spUpdateEntityPermission calls, no creates or deletes). Each call passes only
-- the filter columns below; the line's tolerant spUpdateEntityPermission keeps every other column.
--   - F6EE8067 (MJ: AI Agent Runs)                    UpdateRLSFilterID = Widget Guest: Own Agent Runs
--   - 343A55BB (MJ: AI Agent Run Steps)               UpdateRLSFilterID = Widget Guest: Own Agent Run Steps
--   - 38382D9B (MJ: AI Prompt Runs)                   UpdateRLSFilterID = Widget Guest: Own Prompt Runs
--   - 75AC2DF9 (MJ: AI Agent Requests)                Read + UpdateRLSFilterID = Widget Guest: Own Agent Requests
--   - 72B995BE (MJ: Conversation Detail Artifacts)    ReadRLSFilterID = Widget Guest: Own Conversation Detail Artifacts
--   - CFDBE38F (MJ: Conversation Skills)              Read + UpdateRLSFilterID = Widget Guest: Own Conversation Skills
--
-- LINE-ONLY, NOT ON next. The statements are the ones next's V202611180023 sync recorded for these
-- six records, matching the .entity-permissions.json diff of #6165 exactly. Filters are looked up
-- by Name, as the JSON's @lookup does. Re-running sets the same values. The version sits one minute
-- after V202611161547 so that, when a 6.1 database later moves to next, none of next's later
-- migrations sort before an applied version; next's own sync then sets these same values.
-- Classified `metadata-migration` (§12): data only, no DDL.

-- Save MJ: Entity Permissions (core SP call only)
DECLARE @UpdateRLSFilterID_f3ee14142045 UNIQUEIDENTIFIER,
@ID_f3ee14142045 UNIQUEIDENTIFIER
SET
  @UpdateRLSFilterID_f3ee14142045 = (
    SELECT
      [ID]
    FROM
      [${flyway:defaultSchema}].[RowLevelSecurityFilter]
    WHERE
      LOWER([Name]) = LOWER(N'Widget Guest: Own Agent Runs')
  )
SET
  @ID_f3ee14142045 = 'F6EE8067-2AA2-4C8F-94A6-0570728B5DF8' EXEC [${flyway:defaultSchema}].spUpdateEntityPermission @UpdateRLSFilterID = @UpdateRLSFilterID_f3ee14142045,
  @ID = @ID_f3ee14142045;

GO

-- Save MJ: Entity Permissions (core SP call only)
DECLARE @UpdateRLSFilterID_3197e6373139 UNIQUEIDENTIFIER,
@ID_3197e6373139 UNIQUEIDENTIFIER
SET
  @UpdateRLSFilterID_3197e6373139 = (
    SELECT
      [ID]
    FROM
      [${flyway:defaultSchema}].[RowLevelSecurityFilter]
    WHERE
      LOWER([Name]) = LOWER(N'Widget Guest: Own Agent Run Steps')
  )
SET
  @ID_3197e6373139 = '343A55BB-F236-4800-867D-F0DB37B322E7' EXEC [${flyway:defaultSchema}].spUpdateEntityPermission @UpdateRLSFilterID = @UpdateRLSFilterID_3197e6373139,
  @ID = @ID_3197e6373139;

GO

-- Save MJ: Entity Permissions (core SP call only)
DECLARE @UpdateRLSFilterID_3d31fdd7ae4e UNIQUEIDENTIFIER,
@ID_3d31fdd7ae4e UNIQUEIDENTIFIER
SET
  @UpdateRLSFilterID_3d31fdd7ae4e = (
    SELECT
      [ID]
    FROM
      [${flyway:defaultSchema}].[RowLevelSecurityFilter]
    WHERE
      LOWER([Name]) = LOWER(N'Widget Guest: Own Prompt Runs')
  )
SET
  @ID_3d31fdd7ae4e = '38382D9B-174A-469A-A90F-282FDFCD3FD9' EXEC [${flyway:defaultSchema}].spUpdateEntityPermission @UpdateRLSFilterID = @UpdateRLSFilterID_3d31fdd7ae4e,
  @ID = @ID_3d31fdd7ae4e;

GO

-- Save MJ: Entity Permissions (core SP call only)
DECLARE @ReadRLSFilterID_d1a28355003c UNIQUEIDENTIFIER,
@UpdateRLSFilterID_d1a28355003c UNIQUEIDENTIFIER,
@ID_d1a28355003c UNIQUEIDENTIFIER
SET
  @ReadRLSFilterID_d1a28355003c = (
    SELECT
      [ID]
    FROM
      [${flyway:defaultSchema}].[RowLevelSecurityFilter]
    WHERE
      LOWER([Name]) = LOWER(N'Widget Guest: Own Agent Requests')
  )
SET
  @UpdateRLSFilterID_d1a28355003c = (
    SELECT
      [ID]
    FROM
      [${flyway:defaultSchema}].[RowLevelSecurityFilter]
    WHERE
      LOWER([Name]) = LOWER(N'Widget Guest: Own Agent Requests')
  )
SET
  @ID_d1a28355003c = '75AC2DF9-DE42-40D6-A347-24B9B4480837' EXEC [${flyway:defaultSchema}].spUpdateEntityPermission @ReadRLSFilterID = @ReadRLSFilterID_d1a28355003c,
  @UpdateRLSFilterID = @UpdateRLSFilterID_d1a28355003c,
  @ID = @ID_d1a28355003c;

GO

-- Save MJ: Entity Permissions (core SP call only)
DECLARE @ReadRLSFilterID_4d99a785a7d5 UNIQUEIDENTIFIER,
@ID_4d99a785a7d5 UNIQUEIDENTIFIER
SET
  @ReadRLSFilterID_4d99a785a7d5 = (
    SELECT
      [ID]
    FROM
      [${flyway:defaultSchema}].[RowLevelSecurityFilter]
    WHERE
      LOWER([Name]) = LOWER(
        N'Widget Guest: Own Conversation Detail Artifacts'
      )
  )
SET
  @ID_4d99a785a7d5 = '72B995BE-337F-4907-9DBC-2A924AD2BB68' EXEC [${flyway:defaultSchema}].spUpdateEntityPermission @ReadRLSFilterID = @ReadRLSFilterID_4d99a785a7d5,
  @ID = @ID_4d99a785a7d5;

GO

-- Save MJ: Entity Permissions (core SP call only)
DECLARE @ReadRLSFilterID_e4d54d421ddc UNIQUEIDENTIFIER,
@UpdateRLSFilterID_e4d54d421ddc UNIQUEIDENTIFIER,
@ID_e4d54d421ddc UNIQUEIDENTIFIER
SET
  @ReadRLSFilterID_e4d54d421ddc = (
    SELECT
      [ID]
    FROM
      [${flyway:defaultSchema}].[RowLevelSecurityFilter]
    WHERE
      LOWER([Name]) = LOWER(N'Widget Guest: Own Conversation Skills')
  )
SET
  @UpdateRLSFilterID_e4d54d421ddc = (
    SELECT
      [ID]
    FROM
      [${flyway:defaultSchema}].[RowLevelSecurityFilter]
    WHERE
      LOWER([Name]) = LOWER(N'Widget Guest: Own Conversation Skills')
  )
SET
  @ID_e4d54d421ddc = 'CFDBE38F-1222-40B4-82EC-F3EA49F785C8' EXEC [${flyway:defaultSchema}].spUpdateEntityPermission @ReadRLSFilterID = @ReadRLSFilterID_e4d54d421ddc,
  @UpdateRLSFilterID = @UpdateRLSFilterID_e4d54d421ddc,
  @ID = @ID_e4d54d421ddc;

GO
