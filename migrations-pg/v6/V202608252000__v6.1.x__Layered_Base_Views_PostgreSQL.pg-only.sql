-- ============================================================================
-- PostgreSQL layered base views: restar helper + core MJ wrappers.
-- ============================================================================
--
-- Does NOT edit V202608050105 (empty-by-design). That file stays as the record
-- of why PG originally refused layering. This file installs the missing pieces:
--
--   1. spRebindLayeredOuterView / spRebindLayeredOuterViewsInSchema
--      Rewrite an application-owned outer view back to SELECT g.*, extras so
--      CREATE VIEW re-expands g.* against the live inner relation. PostgreSQL
--      freezes * at CREATE; CREATE OR REPLACE on the inner never touches the
--      outer. CodeGen and Open App migrate call these after inner regeneration.
--
--   2. Inner + outer views for the two core layered entities that 050105
--      shipped on SQL Server: Version Installations and User View Run Details.
--      Functions that RETURNS SETOF the public view are dropped and recreated
--      so they bind to the new row type.
--
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

    v_def := btrim(pg_get_viewdef(v_outer_oid, true));
    IF right(v_def, 1) = ';' THEN
        v_def := btrim(left(v_def, length(v_def) - 1));
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

    v_select_list := btrim(substr(v_def, 1, v_from_pos - 1));
    v_select_list := btrim(regexp_replace(v_select_list, '^select\y', '', 'i'));
    v_rest := btrim(substr(v_def, v_from_pos));

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
            v_items := array_append(v_items, btrim(substr(v_select_list, v_start, v_i - v_start)));
            v_start := v_i + 1;
        END IF;
        v_i := v_i + 1;
    END LOOP;
    v_items := array_append(v_items, btrim(substr(v_select_list, v_start)));

    IF v_items[1] ~ ('^"?' || v_alias || '"?\.\*$') OR btrim(v_items[1]) = '*' THEN
        v_consumed := 1;
        v_starred := true;
    ELSE
        FOREACH v_item IN ARRAY v_items LOOP
            v_item := btrim(v_item);
            v_item := regexp_replace(v_item, '::[[:alnum:]_."[:space:]()]+$', '');
            v_item := btrim(v_item);
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

    IF v_extras IS NULL OR btrim(v_extras) = '' THEN
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

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spRebindLayeredOuterViewsInSchema"(
    p_Schema text
)
RETURNS void
LANGUAGE plpgsql
AS $fn$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT e."BaseView", e."GeneratedBaseViewName"
        FROM ${flyway:defaultSchema}."Entity" e
        WHERE lower(e."SchemaName") = lower(p_Schema)
          AND e."GeneratedBaseViewName" IS NOT NULL
          AND btrim(e."GeneratedBaseViewName") <> ''
          AND lower(e."GeneratedBaseViewName") <> lower(e."BaseView")
    LOOP
        PERFORM ${flyway:defaultSchema}."spRebindLayeredOuterView"(p_Schema, r."BaseView", r."GeneratedBaseViewName");
    END LOOP;
END;
$fn$;

COMMENT ON FUNCTION ${flyway:defaultSchema}."spRebindLayeredOuterView"(text, text, text) IS
    'Restar a layered outer view to SELECT g.*, extras so g.* re-expands against the current inner view. No-op if either view is missing.';

COMMENT ON FUNCTION ${flyway:defaultSchema}."spRebindLayeredOuterViewsInSchema"(text) IS
    'Rebind every layered outer view in a schema. Used after Open App migrate on PostgreSQL.';

COMMENT ON COLUMN ${flyway:defaultSchema}."Entity"."GeneratedBaseViewName" IS
    'When set, CodeGen generates the entity''s full base view under THIS name instead of BaseView, and the application owns BaseView — which is expected to wrap it (SELECT g.*, <extras> FROM <GeneratedBaseViewName> g). Related-entity display joins, geo columns and recursive root-ID columns keep regenerating underneath. BaseView remains the public surface. On SQL Server, CodeGen refreshes the outer view with sp_refreshview. On PostgreSQL, CodeGen and mj migrate restar the outer view (spRebindLayeredOuterView) so g.* re-expands; the outer SQL itself is shipped by pg-migrate.';

-- ---------------------------------------------------------------------------
-- Core MJ layered entities (SQL Server shipped these in V202608050105).
-- Drop create/update functions first so the public view can be replaced.
-- ---------------------------------------------------------------------------

DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT oid::regprocedure AS sig
        FROM pg_proc
        WHERE pronamespace = '${flyway:defaultSchema}'::regnamespace
          AND proname IN (
              'spCreateVersionInstallation',
              'spUpdateVersionInstallation',
              'spCreateUserViewRunDetail',
              'spUpdateUserViewRunDetail'
          )
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE VIEW ${flyway:defaultSchema}."vwVersionInstallationsGenerated"
AS
SELECT
    v.*
FROM
    ${flyway:defaultSchema}."VersionInstallation" AS v;

CREATE OR REPLACE VIEW ${flyway:defaultSchema}."vwUserViewRunDetailsGenerated"
AS
SELECT
    u.*,
    MJUserViewRun_UserViewRunID."UserView" AS "UserViewRun"
FROM
    ${flyway:defaultSchema}."UserViewRunDetail" AS u
INNER JOIN
    ${flyway:defaultSchema}."vwUserViewRuns" AS MJUserViewRun_UserViewRunID
  ON
    u."UserViewRunID" = MJUserViewRun_UserViewRunID."ID";

DROP VIEW IF EXISTS ${flyway:defaultSchema}."vwVersionInstallations";
CREATE VIEW ${flyway:defaultSchema}."vwVersionInstallations"
AS
SELECT
    g.*,
    g."MajorVersion"::text || '.' || g."MinorVersion"::text || '.' || g."PatchVersion"::text AS "CompleteVersion"
FROM
    ${flyway:defaultSchema}."vwVersionInstallationsGenerated" g;

DROP VIEW IF EXISTS ${flyway:defaultSchema}."vwUserViewRunDetails";
CREATE VIEW ${flyway:defaultSchema}."vwUserViewRunDetails"
AS
SELECT
    g.*,
    uv."ID" AS "UserViewID",
    uv."EntityID"
FROM
    ${flyway:defaultSchema}."vwUserViewRunDetailsGenerated" g
INNER JOIN
    ${flyway:defaultSchema}."UserViewRun" uvr
  ON
    g."UserViewRunID" = uvr."ID"
INNER JOIN
    ${flyway:defaultSchema}."UserView" uv
  ON
    uvr."UserViewID" = uv."ID";

GRANT SELECT ON ${flyway:defaultSchema}."vwVersionInstallationsGenerated" TO "cdp_Integration", "cdp_UI", "cdp_Developer";
GRANT SELECT ON ${flyway:defaultSchema}."vwVersionInstallations" TO "cdp_Integration", "cdp_UI", "cdp_Developer";
GRANT SELECT ON ${flyway:defaultSchema}."vwUserViewRunDetailsGenerated" TO "cdp_Developer", "cdp_UI", "cdp_Integration";
GRANT SELECT ON ${flyway:defaultSchema}."vwUserViewRunDetails" TO "cdp_Developer", "cdp_UI", "cdp_Integration";

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spCreateVersionInstallation"(
    p_id UUID DEFAULT NULL,
    p_majorversion int DEFAULT NULL,
    p_minorversion int DEFAULT NULL,
    p_patchversion int DEFAULT NULL,
    p_type_clear boolean DEFAULT false,
    p_type varchar(20) DEFAULT NULL,
    p_installedat TIMESTAMPTZ DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_installlog_clear boolean DEFAULT false,
    p_installlog TEXT DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments TEXT DEFAULT NULL
) RETURNS SETOF ${flyway:defaultSchema}."vwVersionInstallations" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO ${flyway:defaultSchema}."VersionInstallation"
        ("ID", "MajorVersion", "MinorVersion", "PatchVersion", "Type", "InstalledAt", "Status", "InstallLog", "Comments")
    VALUES
        (
            v_new_id,
            p_majorversion,
            p_minorversion,
            p_patchversion,
            CASE WHEN p_type_clear = true THEN NULL ELSE COALESCE(p_type, 'System') END,
            p_installedat,
            COALESCE(p_status, 'Pending'),
            CASE WHEN p_installlog_clear = true THEN NULL ELSE COALESCE(p_installlog, NULL) END,
            CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, NULL) END
        );
    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwVersionInstallations"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spCreateVersionInstallation" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spCreateVersionInstallation" TO "cdp_Developer";

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spUpdateVersionInstallation"(
    p_id UUID,
    p_majorversion int DEFAULT NULL,
    p_minorversion int DEFAULT NULL,
    p_patchversion int DEFAULT NULL,
    p_type_clear boolean DEFAULT false,
    p_type varchar(20) DEFAULT NULL,
    p_installedat TIMESTAMPTZ DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_installlog_clear boolean DEFAULT false,
    p_installlog TEXT DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments TEXT DEFAULT NULL
) RETURNS SETOF ${flyway:defaultSchema}."vwVersionInstallations" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE ${flyway:defaultSchema}."VersionInstallation"
    SET
        "MajorVersion" = COALESCE(p_majorversion, "MajorVersion"),
        "MinorVersion" = COALESCE(p_minorversion, "MinorVersion"),
        "PatchVersion" = COALESCE(p_patchversion, "PatchVersion"),
        "Type" = CASE WHEN p_type_clear = true THEN NULL ELSE COALESCE(p_type, "Type") END,
        "InstalledAt" = COALESCE(p_installedat, "InstalledAt"),
        "Status" = COALESCE(p_status, "Status"),
        "InstallLog" = CASE WHEN p_installlog_clear = true THEN NULL ELSE COALESCE(p_installlog, "InstallLog") END,
        "Comments" = CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, "Comments") END
    WHERE "ID" = p_id;
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count = 0 THEN
        RETURN;
    END IF;
    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwVersionInstallations"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spUpdateVersionInstallation" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spUpdateVersionInstallation" TO "cdp_Developer";

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spCreateUserViewRunDetail"(
    p_id UUID DEFAULT NULL,
    p_userviewrunid UUID DEFAULT NULL,
    p_recordid varchar(450) DEFAULT NULL
) RETURNS SETOF ${flyway:defaultSchema}."vwUserViewRunDetails" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO ${flyway:defaultSchema}."UserViewRunDetail"
        ("ID", "UserViewRunID", "RecordID")
    VALUES
        (v_new_id, p_userviewrunid, p_recordid);
    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwUserViewRunDetails"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spCreateUserViewRunDetail" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spCreateUserViewRunDetail" TO "cdp_Integration";

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spUpdateUserViewRunDetail"(
    p_id UUID,
    p_userviewrunid UUID DEFAULT NULL,
    p_recordid varchar(450) DEFAULT NULL
) RETURNS SETOF ${flyway:defaultSchema}."vwUserViewRunDetails" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE ${flyway:defaultSchema}."UserViewRunDetail"
    SET
        "UserViewRunID" = COALESCE(p_userviewrunid, "UserViewRunID"),
        "RecordID" = COALESCE(p_recordid, "RecordID")
    WHERE "ID" = p_id;
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count = 0 THEN
        RETURN;
    END IF;
    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwUserViewRunDetails"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spUpdateUserViewRunDetail" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spUpdateUserViewRunDetail" TO "cdp_Integration";
