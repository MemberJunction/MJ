-- PG-ONLY forward fix: repair TypeScript corrupted by the SS->PG baseline converter.
--
-- The SS->PG baseline conversion applied SQL identifier-quoting to TypeScript that is
-- stored INSIDE data columns (__mj."GeneratedCode"."Code" — the AI-generated field
-- validators). It rewrote TS member access like `this.GranteeType` into
-- `this."GranteeType"`, which is invalid TypeScript. When `mj codegen` reads those
-- validators back and emits them into entity_subclasses.ts, the generated file fails to
-- compile (TS1003 "Identifier expected"), which blocks the entire build on a fresh PG DB.
-- The SQL Server baseline is unaffected (it stores the TS verbatim), so this is PG-only.
--
-- Scope is deliberately narrow and auditable: only TypeScript rows, and only the three
-- member-access prefixes the generated validators ever use — `this.`, `result.`, and
-- `ValidationErrorType.`. We do NOT touch the general `."Ident"` form, because in other
-- columns (Query SQL, view definitions, etc.) `."Ident"` is *correct* PostgreSQL identifier
-- quoting and must be preserved. A string literal is never preceded by `<ident>."`, so
-- these three replacements cannot corrupt legitimate string content.

UPDATE ${flyway:defaultSchema}."GeneratedCode"
SET "Code" = regexp_replace(
               regexp_replace(
                 regexp_replace(
                   "Code",
                   'this\."([A-Za-z_][A-Za-z0-9_]*)"', 'this.\1', 'g'),
                 'result\."([A-Za-z_][A-Za-z0-9_]*)"', 'result.\1', 'g'),
               'ValidationErrorType\."([A-Za-z_][A-Za-z0-9_]*)"', 'ValidationErrorType.\1', 'g')
WHERE "Language" = 'TypeScript'
  AND "Code" ~ '(this|result|ValidationErrorType)\."[A-Za-z_]';
