-- ============================================================================
-- Strip TS-style SQL identifier quoting from text columns that hold non-SQL
-- code (TypeScript and Nunjucks templates).
--
-- Background:
--   The SQL Server → PostgreSQL converter that produced
--   B202602151200__v5.0__Baseline.pg.sql wrapped bare PascalCase property
--   accesses inside SQL string literals with double quotes — turning
--     params.Params.find(p => p.Name === 'id')
--   into
--     params."Params".find(p => p."Name" === 'id')
--   The doubled-quote forms are valid SQL inside string literals (regular
--   characters), but when those strings are LATER read back by codegen and
--   written into .ts files, the result is invalid TypeScript and the
--   downstream `npm run build` of CoreActions fails.
--
-- Affected columns (audited 2026-05-04 against MJ_PG_RUNTIME @ v5.33.0 base):
--   - __mj.Action.Code            — 6 rows (TypeScript action bodies)
--   - __mj.TemplateContent.TemplateText — 26 rows (Nunjucks templates that
--                                                   reference field.Name etc.)
--
-- Fix:
--   regexp_replace each affected column to strip the unwanted double quotes
--   in `XYZ."FieldName"` patterns. The PG regex `\.\"([A-Za-z_][A-Za-z0-9_]*)\"`
--   only matches `."Name"` after a dot — matching JS/Nunjucks property access
--   shape, not SQL identifier shape (which would be standalone `"Name"`).
--   Idempotent: re-running on already-clean data is a no-op because the
--   pattern can't match anything that lacks the quotes.
--
-- Scope:
--   Forward fix only. The B-baseline file remains unchanged per project
--   policy. Future runs of `mj migrate` apply this V-migration after the
--   baseline and end up with clean data. The converter side of the bug
--   (preventing recurrence on next regen of the baseline) is tracked as a
--   separate issue.
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
