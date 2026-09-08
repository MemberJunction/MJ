-- ============================================================================
-- Fix: spRebindLayeredOuterView could never restar a layered outer view.
-- ============================================================================
--
-- V202608252000 shipped this function with TWO defects. The first masked the
-- second, so neither was visible: the function was never able to run at all,
-- and once it could, it produced invalid SQL.
--
-- DEFECT 1 -- undeclared variable, so every call failed.
--   The already-starred branch assigned `v_starred := true;`, but `v_starred`
--   is never declared. PL/pgSQL compiles the WHOLE body on first invocation, so
--   the branch was irrelevant -- every call raised:
--       ERROR: "v_starred" is not a known variable
--   PostgreSQL validates a plpgsql body only at execution, never at
--   CREATE FUNCTION, so the migration applied green and the function died on
--   first use. Fixed by removing the write: `v_starred` was only ever written,
--   never read, and the surrounding logic is complete without it (v_consumed
--   marks the starred case; extras are taken from v_consumed + 1 onward). The
--   TypeScript reference, restarLayeredOuterView() in @memberjunction/sql-dialect,
--   has no equivalent flag.
--
-- DEFECT 2 -- single-argument btrim() strips SPACES ONLY, not newlines.
--   `pg_get_viewdef(oid, true)` pretty-prints, so every SELECT item after the
--   first arrives with a leading newline. The consumption loop compares each
--   trimmed item against the inner view's column list and EXITs on the first
--   miss, so it consumed exactly one column and treated every remaining inner
--   column as an application "extra". The rebuilt view was then:
--       SELECT g.*, "MajorVersion", "MinorVersion", ...
--   which PostgreSQL rejects:
--       ERROR: column "MajorVersion" specified more than once
--   Verified: btrim(E'\n  "MajorVersion"') does NOT strip the newline, while
--   btrim(E'\n  "MajorVersion"', E' \t\r\n') does. Every trim that touches
--   deparsed SQL text now passes an explicit whitespace character set. The
--   TypeScript reference uses .trim(), which already handles all whitespace --
--   which is why the CodeGen path worked while this one could not.
--
-- Shipped as a NEW migration rather than an edit to V202608252000: that file is
-- already applied wherever it has run, and Skyway skips an applied version, so
-- an in-place edit would repair fresh installs only and leave existing
-- databases holding the broken function. CREATE OR REPLACE FUNCTION repairs both.
--
-- The body below is V202608252000's, with those two corrections and no others.
-- ============================================================================

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spRebindLayeredOuterView"(
    p_Schema text,
    p_OuterView text,
    p_InnerView text
)
RETURNS void
LANGUAGE plpgsql
AS $fn$
DECLARE
    v_outer_oid oid;
    v_inner_oid oid;
    v_def text;
    v_from_pos int;
    v_select_list text;
    v_rest text;
    v_alias text := 'g';
    v_items text[];
    v_item text;
    v_extras text := '';
    v_consumed int := 0;
    v_inner_cols text[];
    v_col text;
    v_restarred text;
    v_create text;
    v_i int;
    v_depth int;
    v_ch text;
    v_q text;
    v_start int;
    rec RECORD;
BEGIN
    v_outer_oid := to_regclass(format('%I.%I', p_Schema, p_OuterView));
    v_inner_oid := to_regclass(format('%I.%I', p_Schema, p_InnerView));
    IF v_outer_oid IS NULL OR v_inner_oid IS NULL THEN
        RETURN;
    END IF;

    SELECT array_agg(a.attname ORDER BY a.attnum)
      INTO v_inner_cols
    FROM pg_attribute a
    WHERE a.attrelid = v_inner_oid
      AND a.attnum > 0
      AND NOT a.attisdropped;

    IF v_inner_cols IS NULL OR array_length(v_inner_cols, 1) IS NULL THEN
        RETURN;
    END IF;

    v_def := btrim(pg_get_viewdef(v_outer_oid, true), E' \t\r\n');
    IF right(v_def, 1) = ';' THEN
        v_def := btrim(left(v_def, length(v_def) - 1), E' \t\r\n');
    END IF;
    IF v_def !~* '^select\y' THEN
        RAISE NOTICE 'spRebindLayeredOuterView: %I.%I definition is not a SELECT', p_Schema, p_OuterView;
        RETURN;
    END IF;

    -- Top-level FROM
    v_depth := 0;
    v_from_pos := 0;
    v_i := 1;
    WHILE v_i <= length(v_def) LOOP
        v_ch := substr(v_def, v_i, 1);
        IF v_ch IN ('''', '"') THEN
            v_q := v_ch;
            v_i := v_i + 1;
            WHILE v_i <= length(v_def) LOOP
                IF substr(v_def, v_i, 1) = v_q THEN
                    IF substr(v_def, v_i + 1, 1) = v_q THEN
                        v_i := v_i + 2;
                        CONTINUE;
                    END IF;
                    v_i := v_i + 1;
                    EXIT;
                END IF;
                v_i := v_i + 1;
            END LOOP;
            CONTINUE;
        END IF;
        IF v_ch = '(' THEN
            v_depth := v_depth + 1;
            v_i := v_i + 1;
            CONTINUE;
        END IF;
        IF v_ch = ')' THEN
            v_depth := v_depth - 1;
            v_i := v_i + 1;
            CONTINUE;
        END IF;
        IF v_depth = 0 AND lower(substr(v_def, v_i, 4)) = 'from'
           AND (v_i = 1 OR substr(v_def, v_i - 1, 1) !~ '[[:alnum:]_$]')
           AND (v_i + 4 > length(v_def) OR substr(v_def, v_i + 4, 1) !~ '[[:alnum:]_$]') THEN
            v_from_pos := v_i;
            EXIT;
        END IF;
        v_i := v_i + 1;
    END LOOP;

    IF v_from_pos = 0 THEN
        RAISE NOTICE 'spRebindLayeredOuterView: no FROM in %I.%I', p_Schema, p_OuterView;
        RETURN;
    END IF;

    v_select_list := btrim(substr(v_def, 1, v_from_pos - 1), E' \t\r\n');
    v_select_list := btrim(regexp_replace(v_select_list, '^select\y', '', 'i'), E' \t\r\n');
    v_rest := btrim(substr(v_def, v_from_pos), E' \t\r\n');

    -- Alias after FROM <qual.inner> [AS] alias
    IF v_rest ~* ('^from[[:space:]].*' || p_InnerView || '[[:space:]]+(as[[:space:]]+)?') THEN
        v_alias := btrim(regexp_replace(
            regexp_replace(v_rest, '^from[[:space:]]+\S+[[:space:]]+(as[[:space:]]+)?', '', 'i'),
            '[[:space:]].*$',
            ''
        ));
        v_alias := trim(both '"' from v_alias);
        IF v_alias IS NULL OR v_alias = '' OR lower(v_alias) IN ('where', 'join', 'left', 'right', 'inner', 'full', 'cross', 'group', 'order', 'limit', 'offset') THEN
            v_alias := 'g';
        END IF;
    END IF;

    -- Split SELECT list on top-level commas
    v_items := ARRAY[]::text[];
    v_depth := 0;
    v_start := 1;
    v_i := 1;
    WHILE v_i <= length(v_select_list) LOOP
        v_ch := substr(v_select_list, v_i, 1);
        IF v_ch IN ('''', '"') THEN
            v_q := v_ch;
            v_i := v_i + 1;
            WHILE v_i <= length(v_select_list) LOOP
                IF substr(v_select_list, v_i, 1) = v_q THEN
                    IF substr(v_select_list, v_i + 1, 1) = v_q THEN
                        v_i := v_i + 2;
                        CONTINUE;
                    END IF;
                    v_i := v_i + 1;
                    EXIT;
                END IF;
                v_i := v_i + 1;
            END LOOP;
            CONTINUE;
        END IF;
        IF v_ch = '(' THEN
            v_depth := v_depth + 1;
        ELSIF v_ch = ')' THEN
            v_depth := v_depth - 1;
        ELSIF v_ch = ',' AND v_depth = 0 THEN
            v_items := array_append(v_items, btrim(substr(v_select_list, v_start, v_i - v_start), E' \t\r\n'));
            v_start := v_i + 1;
        END IF;
        v_i := v_i + 1;
    END LOOP;
    v_items := array_append(v_items, btrim(substr(v_select_list, v_start), E' \t\r\n'));

    IF v_items[1] ~ ('^"?' || v_alias || '"?\.\*$') OR btrim(v_items[1], E' \t\r\n') = '*' THEN
        v_consumed := 1;
    ELSE
        FOREACH v_item IN ARRAY v_items LOOP
            v_item := btrim(v_item, E' \t\r\n');
            v_item := regexp_replace(v_item, '::[[:alnum:]_."[:space:]()]+$', '');
            v_item := btrim(v_item, E' \t\r\n');
            v_item := regexp_replace(v_item, '[[:space:]]+[Aa][Ss][[:space:]]+"?[A-Za-z_][A-Za-z0-9_$]*"?$', '');
            -- strip alias.
            IF v_item ~ ('^"?' || v_alias || '"?\.') THEN
                v_item := regexp_replace(v_item, '^"?[A-Za-z_][A-Za-z0-9_$]*"?\.', '');
            END IF;
            v_col := trim(both '"' from v_item);
            IF v_col = ANY (v_inner_cols) THEN
                v_consumed := v_consumed + 1;
            ELSE
                EXIT;
            END IF;
        END LOOP;
    END IF;

    IF v_consumed = 0 THEN
        RAISE NOTICE 'spRebindLayeredOuterView: %I.%I is not a g.* wrapper over %I', p_Schema, p_OuterView, p_InnerView;
        RETURN;
    END IF;

    IF v_consumed < coalesce(array_length(v_items, 1), 0) THEN
        v_extras := array_to_string(v_items[v_consumed + 1 : array_length(v_items, 1)], E',\n    ');
    END IF;

    IF v_extras IS NULL OR btrim(v_extras, E' \t\r\n') = '' THEN
        v_restarred := format('SELECT %I.*%s%s', v_alias, E'\n', v_rest);
    ELSE
        v_restarred := format('SELECT %I.*,%s    %s%s%s', v_alias, E'\n', v_extras, E'\n', v_rest);
    END IF;

    v_create := format('CREATE OR REPLACE VIEW %I.%I AS %s', p_Schema, p_OuterView, v_restarred);

    BEGIN
        EXECUTE v_create;
    EXCEPTION WHEN invalid_table_definition THEN
        CREATE TEMP TABLE IF NOT EXISTS _rebind_fn_deps (
            definition text
        ) ON COMMIT DROP;
        DELETE FROM _rebind_fn_deps;

        INSERT INTO _rebind_fn_deps (definition)
        SELECT DISTINCT pg_get_functiondef(pp.oid)
        FROM pg_depend d
        JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
        WHERE d.refobjid = v_outer_oid
        UNION
        SELECT DISTINCT pg_get_functiondef(pp.oid)
        FROM pg_proc pp
        JOIN pg_type pt ON pp.prorettype = pt.oid
        WHERE pt.typrelid = v_outer_oid;

        EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', p_Schema, p_OuterView);
        EXECUTE format('CREATE VIEW %I.%I AS %s', p_Schema, p_OuterView, v_restarred);

        FOR rec IN SELECT definition FROM _rebind_fn_deps LOOP
            BEGIN
                EXECUTE rec.definition;
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'spRebindLayeredOuterView: skipped function restore: %', SQLERRM;
            END;
        END LOOP;
    END;
END;
$fn$;
