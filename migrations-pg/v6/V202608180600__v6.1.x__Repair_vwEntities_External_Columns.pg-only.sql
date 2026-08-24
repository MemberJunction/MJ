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
--   The derived definition is WRAPPED, not edited. An earlier version of this file
--   searched pg_get_viewdef() output for the literal select-list/FROM boundary and
--   spliced the two columns in before it. That reads well and keeps the view flat, but
--   it assumes a shape: one exact anchor, at one exact indentation, with __mj."Entity"
--   as the first FROM entry under the alias `e`. A view carrying a CTE, a different
--   base alias, or a derived table renders with no such anchor, and the splice then had
--   no honest option but to abort the whole migration run. Wrapping makes the repair
--   independent of how the existing definition happens to be written:
--
--       SELECT base.*, e."ExternalDataSourceID", e."ExternalObjectName"
--         FROM ( <existing definition> ) base
--         LEFT JOIN __mj."Entity" e ON e."ID" = base."ID"
--
--   `base.*` is expanded at creation time, so the stored definition names the columns
--   explicitly and in their original order — which is what CREATE OR REPLACE VIEW
--   requires. The join is a primary-key self-join on a catalog table of a few hundred
--   rows, against a view the Explorer reads constantly; it is not a meaningful cost.
--
--   PostgreSQL's CREATE OR REPLACE VIEW allows exactly one in-place change — appending
--   columns after the existing ones — and rejects anything else with 42P16. Appending
--   is therefore safe: no DROP, no CASCADE, no lost dependent views, functions, grants
--   or comments. MJ resolves fields by name, so the trailing position is irrelevant.
--   Verified against a real baseline database where __mj.spCreateEntity and its
--   siblings are declared RETURNS SETOF __mj."vwEntities" — those dependencies do not
--   block the append.
--
--   Idempotent, and a no-op on any install that already has the columns (every SQL
--   Server install, and any PostgreSQL install already repaired).
--
--   It never aborts the run. This repairs historical drift, so it can encounter a view
--   it does not recognise; on a release gate that must be a skipped repair with a loud
--   notice, not a failed migration. The CodeGenLib validator shipped alongside this file
--   is what reports the unrepaired case.
--
-- No undo script: MJ does not ship them, and reverting would mean removing columns the
-- metadata declares — i.e. deliberately restoring the unreadable state.

DO $do$
DECLARE
    v_def   text;
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

    -- The base view must expose "ID" for the join that carries the two columns across.
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = '__mj' AND table_name = 'vwEntities' AND column_name = 'ID'
    ) THEN
        RAISE NOTICE 'vwEntities does not expose "ID" - cannot append the External* columns by join; skipping. Rebuild this view via CodeGen.';
        RETURN;
    END IF;

    -- rtrim the trailing semicolon: the definition becomes a derived table below.
    SELECT rtrim(rtrim(pg_get_viewdef('__mj."vwEntities"'::regclass, true)), ';') INTO v_def;

    -- Aliases are deliberately implausible as user identifiers, so they cannot collide
    -- with a CTE, table alias or column alias inside the definition being wrapped.
    EXECUTE format(
        'CREATE OR REPLACE VIEW __mj."vwEntities" AS '
        'SELECT %1$I.*, %2$I."ExternalDataSourceID", %2$I."ExternalObjectName" '
        'FROM (%3$s) %1$I '
        'LEFT JOIN __mj."Entity" %2$I ON %2$I."ID" = %1$I."ID"',
        '__mj_repair_base', '__mj_repair_ext', v_def
    );

    RAISE NOTICE 'vwEntities repaired: ExternalDataSourceID and ExternalObjectName appended';
END
$do$;
