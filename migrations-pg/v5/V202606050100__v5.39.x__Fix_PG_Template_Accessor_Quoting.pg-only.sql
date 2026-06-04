-- ============================================================================
-- POSTGRESQL-ONLY MIGRATION
-- This migration applies ONLY to PostgreSQL databases. It has no SQL Server
-- equivalent because the bug it fixes is specific to the T-SQL → PostgreSQL
-- conversion pipeline.
-- ============================================================================
--
-- PROBLEM:
--   The old T-SQL → PostgreSQL converter applied its bracket-identifier quoting
--   ([Name] → "Name") against the ENTIRE SQL string, including inside string
--   literal CONTENT. Template bodies and component specifications are stored as
--   long string literals that happen to contain dotted accessors such as:
--
--     Nunjucks / docs:   base.AgentName, base.TotalRuns
--     JS component spec:  result.Success, utilities.rv.RunView, callbacks.OpenEntityRecord
--
--   When the baseline metadata was converted to PG, the converter mistook these
--   in-string dotted member accesses for bracketed identifiers and quoted the
--   trailing segment:
--
--     SOURCE (T-SQL / metadata):  SELECT base.AgentName, base.TotalRuns ...
--     PG (corrupted):             SELECT base."AgentName", base."TotalRuns" ...
--
--     SOURCE (component JS):      if (result.Success) { ... rv.RunView({...}) }
--     PG (corrupted):             if (result."Success") { ... rv."RunView"({...}) }
--
-- IMPACT:
--   `."Word"` is invalid JavaScript member-access syntax and is not how Nunjucks
--   template variables are written either. The corruption therefore breaks:
--     * Nunjucks prompt templates (TemplateContent.TemplateText) — the rendered
--       prompt now contains broken example SQL / accessors.
--     * Interactive component specs (Component.Specification / TechnicalDesign /
--       FunctionalRequirements / Description) — the embedded JS no longer parses
--       (`result."Success"` is a syntax error).
--
-- FIX:
--   The converter bug is fixed upstream (it no longer rewrites string-literal
--   contents). This migration repairs already-deployed PG databases by stripping
--   the spurious quotes from dotted accessors inside the affected template /
--   component text columns, turning `ident."Word"` back into `ident.Word`.
--
-- SAFETY:
--   * The fix is CONFINED to the specific template/component text columns below.
--     It is deliberately NOT run against identifier columns (EntityField.Name,
--     etc.) nor against columns that legitimately store PG-quoted SQL identifiers
--     (Query.SQL, QuerySQL.SQL), nor against transient log/audit JSON
--     (RecordChange.*, AIPromptRun.*). Those are intentionally left untouched.
--   * Within these columns the intact source contains ZERO legitimate `."Word"`
--     sequences (verified against the SQL-Server-sourced metadata — e.g. the
--     query-strategist template source reads `SELECT base.AgentName,
--     base.TotalRuns` UNquoted), and `."Word"` is invalid JS / Nunjucks. So the
--     un-quote can only ever UNDO converter corruption; it cannot damage valid
--     content.
--   * The regex `([a-z][A-Za-z0-9_]*)\."([A-Z][A-Za-z0-9_]*)"` matches a lowercase
--     leading identifier char, then any identifier chars, a dot, then a quoted
--     PascalCase segment, and rewrites it to `\1.\2` (drops the quotes). The WHERE
--     clause uses the same shape so only corrupted rows are rewritten. Idempotent:
--     re-running matches nothing once fixed.
--   * CHAINED ACCESSORS: a corrupted chain such as `agent.Record."Field"` has the
--     un-quoted segment (`Record`) starting with an UPPERCASE char, so the regex
--     anchor (`[a-z]`) lands mid-token and a single `regexp_replace(...,'g')` pass
--     leaves residue when two corrupted accessors abut (PostgreSQL's global scan is
--     non-overlapping). To guarantee full convergence regardless of chain depth,
--     each column is rewritten in a loop that repeats until zero rows change. The
--     loop is bounded (max 10 iterations) as a safety stop; empirically 2 passes
--     suffice for the current data.
-- ============================================================================

DO $migration$
DECLARE
    -- (schema, table, column) triples to repair — template/component text only.
    targets text[][] := ARRAY[
        ['TemplateContent', 'TemplateText'],            -- Nunjucks prompt templates
        ['Component',       'Specification'],            -- interactive component spec (JS)
        ['Component',       'TechnicalDesign'],          -- component technical design
        ['Component',       'FunctionalRequirements'],   -- component functional requirements
        ['Component',       'Description']               -- component description
    ];
    t            text;
    col          text;
    i            int;
    affected     bigint;
    passes       int;
    corrupt_re   constant text := '[a-z][A-Za-z0-9_]*\."[A-Z][A-Za-z0-9_]*"';
BEGIN
    FOR i IN array_lower(targets, 1) .. array_upper(targets, 1) LOOP
        t   := targets[i][1];
        col := targets[i][2];
        passes := 0;
        LOOP
            EXECUTE format(
                'UPDATE __mj.%I '
                || 'SET %I = regexp_replace(%I, %L, %L, %L) '
                || 'WHERE %I ~ %L',
                t,
                col, col, '([a-z][A-Za-z0-9_]*)\."([A-Z][A-Za-z0-9_]*)"', '\1.\2', 'g',
                col, corrupt_re
            );
            GET DIAGNOSTICS affected = ROW_COUNT;
            passes := passes + 1;
            EXIT WHEN affected = 0 OR passes >= 10;
        END LOOP;
        RAISE NOTICE 'Fixed __mj.% .% in % pass(es)', t, col, passes;
    END LOOP;
END
$migration$;
