-- ============================================================================
-- One-time cleanup: drop duplicate stored procedure overloads accumulated
-- by older v5.x migrations that emitted CREATE OR REPLACE FUNCTION without
-- prior DROP guards.
--
-- Why this exists:
--
--   PG dispatches functions by (name, ordered-arg-type-list). When a
--   migration emits `CREATE OR REPLACE FUNCTION` with a different signature
--   than the prior definition (e.g. adding a parameter — even with DEFAULT),
--   PG creates a NEW overload alongside the old one rather than replacing.
--   Multiple intermediate v5.x migrations regenerated sprocs with new
--   signatures without DROP guards, leaving duplicate overloads in the
--   __mj schema. At call time, PG cannot disambiguate by name and raises
--   "function ... is not unique."
--
--   The structural fix in the converter (PR adding `emitDropOverloadsBlock`
--   to ProcedureToFunctionRule and FunctionRule) added DROP-overload blocks
--   to every CREATE OR REPLACE FUNCTION going forward, so this class of bug
--   cannot recur in newly-converted migrations. This file is the one-shot
--   remediation for the latent state created by previously-committed
--   migrations on a fresh PG install applying all v5 migrations in order.
--
-- Scope:
--
--   - Targets only `sp%` function names (sproc-style) in `__mj` schema.
--   - `sp%` functions have 0 catalog-tracked dependents (audited via
--     pg_depend on 2026-05-04: zero pg_rewrite/pg_trigger/pg_class entries
--     reference sproc functions). CASCADE is safe.
--   - Trigger functions (`trgUpdate*_func`) take `()` and their signatures
--     cannot change, so they cannot accumulate duplicates — not targeted.
--   - Handwritten utility functions (`GetProgrammaticName`,
--     `StripToAlphanumeric`, `fn*_GetRootID`, etc.) have view dependents
--     and are static-text in the converter source — not targeted.
--
-- Idempotency:
--
--   Re-applying this migration after sprocs are clean (single overload
--   per name) is a no-op, because the `GROUP BY ... HAVING COUNT(*) > 1`
--   clause only matches names with multiple overloads.
--
-- Operational note:
--
--   After applying this migration, run `mj codegen` to regenerate the
--   dropped sprocs with their current correct signatures. This is the
--   standard upgrade flow on PG (`mj migrate` followed by `mj codegen`)
--   and does not introduce a new step.
-- ============================================================================

DO $$
DECLARE
    duplicate_name text;
    overload_sig text;
    drop_count INTEGER := 0;
    name_count INTEGER := 0;
BEGIN
    FOR duplicate_name IN
        SELECT proname FROM pg_proc
        WHERE pronamespace = '${flyway:defaultSchema}'::regnamespace
          AND proname LIKE 'sp%'
        GROUP BY proname
        HAVING COUNT(*) > 1
    LOOP
        name_count := name_count + 1;
        FOR overload_sig IN
            SELECT oid::regprocedure::text FROM pg_proc
            WHERE proname = duplicate_name
              AND pronamespace = '${flyway:defaultSchema}'::regnamespace
        LOOP
            EXECUTE 'DROP FUNCTION IF EXISTS ' || overload_sig || ' CASCADE';
            drop_count := drop_count + 1;
        END LOOP;
    END LOOP;

    IF name_count > 0 THEN
        RAISE NOTICE 'Cleanup: dropped % overload(s) across % distinct sproc name(s)', drop_count, name_count;
        RAISE NOTICE 'Run `mj codegen` to regenerate the dropped sprocs with correct signatures.';
    ELSE
        RAISE NOTICE 'Cleanup: no duplicate sproc overloads found — nothing to do';
    END IF;
END $$;
