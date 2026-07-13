-- ============================================================================
-- Re-apply the TS-identifier-quoting cleanup for code/template columns, AFTER
-- the v5.38 baseline.
--
-- This is a forward re-application of
--   V202605041700__v5.33.x__Fix_TS_Identifier_Quoting_In_Code_Columns.pg-only.sql
-- whose correction was lost: that migration's timestamp (202605041700) predates
-- the v5.38 baseline (B202605291452), so on a fresh install Skyway treats it as
-- pre-baseline and skips it — while the regenerated baseline reintroduced the
-- old SQL Server → PostgreSQL converter's mangling, e.g.
--     params.Params.find(p => p.Name === 'id')   (correct TypeScript)
--   becomes
--     params."Params".find(p => p."Name" === 'id') (invalid TypeScript)
-- The doubled-quote form is harmless as a SQL string literal, but `mj codegen`
-- reads these columns back and writes them into .ts files (CoreActions
-- action_subclasses.ts, generated templates), producing code that fails to
-- compile — which in turn breaks the CLI class-registration manifest import.
--
-- PG-only: the SQL Server baselines store the correct unquoted form, so there
-- is nothing to fix on that platform.
--
-- The `\.\"([A-Za-z_][A-Za-z0-9_]*)\"` pattern matches `."Name"` only after a
-- dot (JS/Nunjucks property-access shape), never a standalone SQL identifier.
-- Idempotent: a no-op on already-clean data.
-- ============================================================================

UPDATE ${flyway:defaultSchema}."Action"
SET "Code" = regexp_replace("Code", '\.\"([A-Za-z_][A-Za-z0-9_]*)\"', '.\1', 'g')
WHERE "Code" ~ '\.\"[A-Za-z_]';

UPDATE ${flyway:defaultSchema}."Action"
SET "CodeComments" = regexp_replace("CodeComments", '\.\"([A-Za-z_][A-Za-z0-9_]*)\"', '.\1', 'g')
WHERE "CodeComments" ~ '\.\"[A-Za-z_]';

UPDATE ${flyway:defaultSchema}."TemplateContent"
SET "TemplateText" = regexp_replace("TemplateText", '\.\"([A-Za-z_][A-Za-z0-9_]*)\"', '.\1', 'g')
WHERE "TemplateText" ~ '\.\"[A-Za-z_]';

DO $$
DECLARE
    action_count INTEGER;
    template_count INTEGER;
BEGIN
    SELECT count(*) INTO action_count FROM ${flyway:defaultSchema}."Action" WHERE "Code" ~ '\.\"[A-Za-z_]';
    SELECT count(*) INTO template_count FROM ${flyway:defaultSchema}."TemplateContent" WHERE "TemplateText" ~ '\.\"[A-Za-z_]';

    IF action_count > 0 OR template_count > 0 THEN
        RAISE WARNING 'TS-quoting cleanup left residual: % Action.Code rows, % TemplateContent.TemplateText rows still match', action_count, template_count;
    END IF;
END $$;
