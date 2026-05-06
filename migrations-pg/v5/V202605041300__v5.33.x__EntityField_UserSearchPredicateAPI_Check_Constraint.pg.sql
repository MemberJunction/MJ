-- ============================================================================
-- Add a CHECK constraint to EntityField.UserSearchPredicateAPI so the runtime
-- contract (BeginsWith / Contains / EndsWith / Exact) is enforced at the
-- database boundary. PG counterpart of V202605041300__v5.33.x; the converter
-- doesn't currently translate the SET NOCOUNT/BEGIN TRANSACTION/IF NOT EXISTS
-- pattern, so this file is hand-authored.
-- ============================================================================

-- 1. Defensively normalize any rows whose value is NOT in the allowed set.
UPDATE "${flyway:defaultSchema}"."EntityField"
SET "UserSearchPredicateAPI" = 'Contains'
WHERE "UserSearchPredicateAPI" IS NULL
   OR "UserSearchPredicateAPI" NOT IN ('BeginsWith', 'Contains', 'EndsWith', 'Exact');

-- 2. Add the CHECK constraint, idempotently. Flyway tracks applied state but
--    a DO block with a pg_constraint catalog probe gives a safety net for
--    retried-after-partial-failure runs.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE c.conname = 'CK_EntityField_UserSearchPredicateAPI'
          AND t.relname = 'EntityField'
          AND n.nspname = '${flyway:defaultSchema}'
    ) THEN
        ALTER TABLE "${flyway:defaultSchema}"."EntityField"
        ADD CONSTRAINT "CK_EntityField_UserSearchPredicateAPI"
        CHECK ("UserSearchPredicateAPI" IN ('BeginsWith', 'Contains', 'EndsWith', 'Exact'));
    END IF;
END $$;
