-- Repair __mj."vwEntities" on PostgreSQL installs where it never gained the two
-- External* columns.
--
-- WHAT WENT WRONG
--   V202607031200__v5.45.x__External_Data_Sources added "ExternalDataSourceID" and
--   "ExternalObjectName" to __mj."Entity" and registered EntityField rows for both.
--   The SQL Server file also rebuilds __mj.vwEntities. The PostgreSQL port does not:
--
--       migrations/v5/V202607031200__v5.45.x__External_Data_Sources.sql       4943 lines, rebuilds vwEntities
--       migrations-pg/v5/V202607031200__v5.45.x__External_Data_Sources.pg.sql 3286 lines, does not
--
--   Both insert the same 54 EntityField rows. So on PostgreSQL the metadata began
--   promising two columns the view could not produce.
--
-- WHY IT NEVER SELF-HEALED
--   CodeGen would normally regenerate the view, but `excludeSchemas` skips SQL
--   generation for excluded schemas entirely (permissions only), and `__mj` is in
--   that list by convention on essentially every install. Nothing else rebuilds
--   core views, so the drift is permanent.
--
-- HOW IT PRESENTS
--   SELECT count(*) FROM __mj."vwEntities"                  -> works, full row count
--   SELECT "ExternalDataSourceID" FROM __mj."vwEntities"    -> ERROR: column does not exist
--   The MJ: Entities grid selects declared fields, hits the error, and renders
--   "0 records / No data to display". No stack trace reaches the user, so an install
--   can sit like this for months — observed live, broken since early July.
--
-- WHY THIS SHAPE
--   The new definition is derived from pg_get_viewdef() rather than written out here.
--   Installs are not all on the same view definition (baseline vintage differs, and
--   some have had CodeGen touch it), so emitting one canonical CREATE would overwrite
--   whatever else an install legitimately has. Deriving preserves it.
--
--   PostgreSQL's CREATE OR REPLACE VIEW allows exactly one in-place change — appending
--   columns after the existing ones — and rejects anything else with 42P16. Appending
--   is therefore safe: no DROP, no CASCADE, no lost dependent views, functions, grants
--   or comments. MJ resolves fields by name, so the trailing position is irrelevant.
--
--   Idempotent, and a no-op on any install that already has the columns (including
--   every SQL Server install and anything built from the v5.46 baseline forward).
--
-- No undo script: MJ does not ship them, and reverting would mean removing columns the
-- metadata declares — i.e. deliberately restoring the unreadable state.

DO $do$
DECLARE
    v_def   text;
    v_new   text;
BEGIN
    IF to_regclass('__mj."vwEntities"') IS NULL THEN
        RAISE NOTICE 'vwEntities does not exist - nothing to repair';
        RETURN;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = '__mj'
           AND table_name   = 'vwEntities'
           AND column_name  = 'ExternalDataSourceID'
    ) THEN
        RAISE NOTICE 'vwEntities already exposes the External* columns - nothing to repair';
        RETURN;
    END IF;

    -- Guard against repairing a view whose base table lacks the columns: that would be
    -- an install that never ran v5.45 at all, where the right answer is to run it.
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = '__mj' AND table_name = 'Entity' AND column_name = 'ExternalDataSourceID'
    ) THEN
        RAISE NOTICE '__mj."Entity" has no ExternalDataSourceID column - v5.45 has not been applied here; skipping';
        RETURN;
    END IF;

    SELECT pg_get_viewdef('__mj."vwEntities"'::regclass, true) INTO v_def;

    -- Append immediately before the view's own FROM clause, which is the end of the
    -- select list. Single backslashes in the replacement on purpose: the pattern is a
    -- regex where \n means newline, but the replacement is literal text, where a
    -- doubled backslash would insert the two characters \ and n and fail to parse.
    v_new := regexp_replace(
                 v_def,
                 E'\n   FROM __mj\\."Entity" e\n',
                 E',\n    e."ExternalDataSourceID",\n    e."ExternalObjectName"\n   FROM __mj."Entity" e\n'
             );

    IF v_new = v_def THEN
        RAISE EXCEPTION 'vwEntities does not have the expected FROM __mj."Entity" e clause; refusing to guess. Rebuild this view via CodeGen instead.';
    END IF;

    EXECUTE 'CREATE OR REPLACE VIEW __mj."vwEntities" AS ' || v_new;
    RAISE NOTICE 'vwEntities repaired: ExternalDataSourceID and ExternalObjectName appended';
END
$do$;
