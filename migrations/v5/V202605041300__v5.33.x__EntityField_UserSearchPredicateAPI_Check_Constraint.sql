-- ============================================================================
-- Add a CHECK constraint to EntityField.UserSearchPredicateAPI so the runtime
-- contract (BeginsWith / Contains / EndsWith / Exact) is enforced at the
-- database boundary. The data provider in @memberjunction/generic-database-
-- provider branches on exactly these values; anything else previously fell
-- through to a Contains LIKE silently. Pair this migration with the data-
-- provider change in the same MJ release.
-- ============================================================================

SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- 1. Defensively normalize any rows whose value is NOT in the allowed set.
--    On stage we observed only the three documented values in use; this is
--    insurance against other MJ deployments that may have manually set
--    something else before the constraint existed.
UPDATE [${flyway:defaultSchema}].[EntityField]
SET UserSearchPredicateAPI = N'Contains'
WHERE UserSearchPredicateAPI IS NULL
   OR UserSearchPredicateAPI NOT IN (N'BeginsWith', N'Contains', N'EndsWith', N'Exact');

-- 2. Add the CHECK constraint. WITH CHECK validates existing rows immediately;
--    the UPDATE above guarantees they all comply. Trusted constraints help the
--    SQL Server query optimizer eliminate impossible branches.
IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = 'CK_EntityField_UserSearchPredicateAPI'
      AND parent_object_id = OBJECT_ID('${flyway:defaultSchema}.EntityField')
)
BEGIN
    ALTER TABLE [${flyway:defaultSchema}].[EntityField] WITH CHECK
    ADD CONSTRAINT CK_EntityField_UserSearchPredicateAPI
    CHECK (UserSearchPredicateAPI IN (N'BeginsWith', N'Contains', N'EndsWith', N'Exact'));
END

COMMIT TRANSACTION;
