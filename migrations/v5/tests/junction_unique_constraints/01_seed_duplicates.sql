-- ============================================================================
-- Test seed: insert duplicate (FK1, FK2) pairs into junction tables BEFORE the
-- UNIQUE-constraint migration runs. Paired with 02_assert_post_migration.sql.
--
-- Usage:
--   1. Apply all migrations EXCEPT V202605221002__v5.37.x__Add_Unique_...
--      (rename it with a _disabled suffix during seed if using Flyway)
--   2. Run this script via sqlcmd against the workbench DB
--   3. Apply the UNIQUE-constraint migration
--   4. Run 02_assert_post_migration.sql to verify dedupe + constraint behavior
--
-- The hardcoded UUIDs below are the test contract — the assert script reads
-- them back to check survivors and confirm deletions.
-- ============================================================================

SET XACT_ABORT ON;
SET NOCOUNT ON;
BEGIN TRANSACTION;

-- ----------------------------------------------------------------------------
-- Pre-flight: confirm the workbench has the parent records the seed needs
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM __mj.Application)
    THROW 50000, 'Seed prerequisite missing: __mj.Application is empty (required for AE test)', 1;

IF NOT EXISTS (SELECT 1 FROM __mj.Entity)
    THROW 50000, 'Seed prerequisite missing: __mj.Entity is empty (required for AE test)', 1;

-- Action and Library are soft prerequisites — if either is empty, the AL portion
-- of the test will be skipped (still produces a valid run for the AE test).
DECLARE @SkipActionLibrary BIT = 0;
IF NOT EXISTS (SELECT 1 FROM __mj.Action) OR NOT EXISTS (SELECT 1 FROM __mj.Library)
BEGIN
    SET @SkipActionLibrary = 1;
    PRINT 'NOTE: __mj.Action or __mj.Library is empty — ActionLibrary portion will be skipped';
END

-- ----------------------------------------------------------------------------
-- Test 1: ApplicationEntity — the production-bug table
-- Seed 3 rows with the same (ApplicationID, EntityID) pair, staggered timestamps.
-- After migration, only the earliest (__mj_CreatedAt) should survive.
-- ----------------------------------------------------------------------------
DECLARE @TestAppID UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM __mj.Application ORDER BY ID);
DECLARE @TestEntID UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM __mj.Entity ORDER BY ID);

DECLARE @AE_Survivor UNIQUEIDENTIFIER = 'AE000000-0000-0000-0000-000000000001';
DECLARE @AE_Dup1     UNIQUEIDENTIFIER = 'AE000000-0000-0000-0000-000000000002';
DECLARE @AE_Dup2     UNIQUEIDENTIFIER = 'AE000000-0000-0000-0000-000000000003';

-- Skip if the seed has already been applied (idempotent re-run)
IF NOT EXISTS (SELECT 1 FROM __mj.ApplicationEntity WHERE ID = @AE_Survivor)
BEGIN
    -- Insert the row expected to survive (Sequence=100 is the sentinel)
    INSERT INTO __mj.ApplicationEntity (ID, ApplicationID, EntityID, Sequence)
        VALUES (@AE_Survivor, @TestAppID, @TestEntID, 100);
    WAITFOR DELAY '00:00:01';

    INSERT INTO __mj.ApplicationEntity (ID, ApplicationID, EntityID, Sequence)
        VALUES (@AE_Dup1, @TestAppID, @TestEntID, 200);
    WAITFOR DELAY '00:00:01';

    INSERT INTO __mj.ApplicationEntity (ID, ApplicationID, EntityID, Sequence)
        VALUES (@AE_Dup2, @TestAppID, @TestEntID, 300);

    PRINT 'Seeded 3 ApplicationEntity rows for (ApplicationID=' + CAST(@TestAppID AS NVARCHAR(36))
          + ', EntityID=' + CAST(@TestEntID AS NVARCHAR(36)) + ')';
    PRINT '  Expected survivor: ' + CAST(@AE_Survivor AS NVARCHAR(36)) + ' (Sequence=100)';
    PRINT '  Expected to be deleted: ' + CAST(@AE_Dup1 AS NVARCHAR(36)) + ', ' + CAST(@AE_Dup2 AS NVARCHAR(36));
END
ELSE
    PRINT 'ApplicationEntity seed already present — skipping';

-- ----------------------------------------------------------------------------
-- Test 2: ActionLibrary — a second confirmation on a different table
-- (skipped automatically if __mj.Action or __mj.Library is empty)
-- ----------------------------------------------------------------------------
DECLARE @AL_Survivor UNIQUEIDENTIFIER = 'A1000000-0000-0000-0000-000000000001';
DECLARE @AL_Dup1     UNIQUEIDENTIFIER = 'A1000000-0000-0000-0000-000000000002';

IF @SkipActionLibrary = 1
BEGIN
    PRINT 'ActionLibrary seed: SKIPPED (prerequisite tables empty)';
END
ELSE IF EXISTS (SELECT 1 FROM __mj.ActionLibrary WHERE ID = @AL_Survivor)
BEGIN
    PRINT 'ActionLibrary seed already present — skipping';
END
ELSE
BEGIN
    DECLARE @TestActionID  UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM __mj.Action ORDER BY ID);
    DECLARE @TestLibraryID UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM __mj.Library ORDER BY ID);

    INSERT INTO __mj.ActionLibrary (ID, ActionID, LibraryID)
        VALUES (@AL_Survivor, @TestActionID, @TestLibraryID);
    WAITFOR DELAY '00:00:01';

    INSERT INTO __mj.ActionLibrary (ID, ActionID, LibraryID)
        VALUES (@AL_Dup1, @TestActionID, @TestLibraryID);

    PRINT 'Seeded 2 ActionLibrary rows for (ActionID=' + CAST(@TestActionID AS NVARCHAR(36))
          + ', LibraryID=' + CAST(@TestLibraryID AS NVARCHAR(36)) + ')';
    PRINT '  Expected survivor: ' + CAST(@AL_Survivor AS NVARCHAR(36));
    PRINT '  Expected to be deleted: ' + CAST(@AL_Dup1 AS NVARCHAR(36));
END

COMMIT TRANSACTION;

PRINT '';
PRINT '============================================================';
PRINT 'Seed complete. Now apply the UNIQUE-constraint migration:';
PRINT '  V202605221002__v5.37.x__Add_Unique_Constraints_To_MJ_Junction_Tables.sql';
PRINT 'Then run 02_assert_post_migration.sql to verify.';
PRINT '============================================================';
